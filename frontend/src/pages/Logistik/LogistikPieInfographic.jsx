import React, { useState, useMemo } from 'react';
import {
    PieChart,
    SlidersHorizontal,
    Package,
    Pencil,
    Laptop,
    Printer,
    Paperclip,
    ScrollText,
    Building2,
    Hospital,
    Droplets,
    Receipt,
    Sparkles,
    FileText,
    Boxes,
    Tag,
    Stethoscope,
    Users,
    Activity,
    CreditCard,
    FolderArchive
} from 'lucide-react';
import './LogistikPieInfographic.css';

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

// Helper icon untuk barang atau unit
export const getLogistikCuteMeta = (name = '', isUnit = false) => {
    const n = String(name || '').toLowerCase();
    const make = (icon, label, badge) => ({ icon, Icon: icon, label, badge });

    if (isUnit) {
        if (n.includes('igd') || n.includes('ugd') || n.includes('darurat')) return make(Stethoscope, 'Gawat Darurat', 'IGD');
        if (n.includes('inap') || n.includes('ranap')) return make(Hospital, 'Rawat Inap', 'Ranap');
        if (n.includes('jalan') || n.includes('rajal') || n.includes('poli')) return make(Activity, 'Rawat Jalan', 'Poli');
        if (n.includes('apotik') || n.includes('farmasi')) return make(Droplets, 'Apotik / Farmasi', 'Farmasi');
        if (n.includes('medik') || n.includes('rekam')) return make(FolderArchive, 'Rekam Medis', 'RM');
        if (n.includes('kasir') || n.includes('keuangan')) return make(CreditCard, 'Kasir / Keuangan', 'Kasir');
        if (n.includes('front') || n.includes('fo') || n.includes('admisi')) return make(Users, 'Front Office', 'FO');
        if (n.includes('operasi') || n.includes('ok') || n.includes('vk')) return make(Activity, 'Kamar Tindakan', 'OK/VK');
        if (n.includes('lab')) return make(Droplets, 'Laboratorium', 'Lab');
        return make(Building2, name || 'Unit Ruangan', 'Unit');
    }

    if (n.includes('kertas') || n.includes('hvs')) return make(FileText, 'Kertas Cetak', 'Kertas');
    if (n.includes('form') || n.includes('formulir')) return make(ScrollText, 'Formulir Medis', 'Form');
    if (n.includes('plastik') || n.includes('klip') || n.includes('kresek')) return make(Boxes, 'Kemasan Plastik', 'Plastik');
    if (n.includes('tissu') || n.includes('towel') || n.includes('sabun') || n.includes('pembersih')) return make(Sparkles, 'Kebersihan', 'Sanitasi');
    if (n.includes('struk') || n.includes('roll') || n.includes('thermal')) return make(Receipt, 'Kertas Thermal', 'Struk');
    if (n.includes('tinta') || n.includes('toner') || n.includes('cartridge')) return make(Printer, 'Tinta / Toner', 'Tinta');
    if (n.includes('pulpen') || n.includes('spidol') || n.includes('pensil') || n.includes('buku')) return make(Pencil, 'Alat Tulis', 'ATK');
    if (n.includes('staples') || n.includes('klip') || n.includes('lem') || n.includes('gunting')) return make(Paperclip, 'Perlengkapan Kantor', 'Kantor');
    if (n.includes('komputer') || n.includes('mouse') || n.includes('keyboard') || n.includes('kabel')) return make(Laptop, 'Perangkat IT', 'IT');

    return make(Package, name || 'Barang Logistik', 'Barang');
};

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

const fmtNum = (v) => Number(v || 0).toLocaleString('id-ID');

export default function LogistikPieInfographic({
    items = [],
    totalValue = 0,
    title = 'Infografis Distribusi',
    subtitle = 'Visualisasi persentase dan proporsi',
    badgeText = 'Top Kontribusi',
    unitLabel = 'Qty',
    isUnitMode = false,
    selectedId = null,
    onSelectItem = null,
}) {
    const [chartLimit, setChartLimit] = useState(6);
    const [isSteppedRadius, setIsSteppedRadius] = useState(true);
    const [hoveredIdx, setHoveredIdx] = useState(null);

    // Compute chart data with auto "Lainnya" grouping
    const chartData = useMemo(() => {
        if (!items || !items.length) return [];

        const sorted = [...items].sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
        const total = totalValue || sorted.reduce((sum, it) => sum + (Number(it.value) || 0), 0) || 1;

        if (chartLimit === 'all' || sorted.length <= chartLimit) {
            return sorted.map((it, idx) => ({
                ...it,
                colorIdx: idx % MACARON_PALETTE.length,
                pct: Number((((Number(it.value) || 0) / total) * 100).toFixed(1)),
            }));
        }

        const topSlices = sorted.slice(0, chartLimit - 1).map((it, idx) => ({
            ...it,
            colorIdx: idx % MACARON_PALETTE.length,
            pct: Number((((Number(it.value) || 0) / total) * 100).toFixed(1)),
        }));

        const others = sorted.slice(chartLimit - 1);
        const othersVal = others.reduce((sum, it) => sum + (Number(it.value) || 0), 0);
        const othersPct = Number(((othersVal / total) * 100).toFixed(1));

        topSlices.push({
            id: '__others__',
            name: `Lainnya (${others.length} ${isUnitMode ? 'Unit' : 'Barang'})`,
            value: othersVal,
            sublabel: `${others.length} data lainnya digabung`,
            isOthers: true,
            colorIdx: 11,
            pct: othersPct,
        });

        return topSlices;
    }, [items, totalValue, chartLimit, isUnitMode]);

    // Angles calculation
    const slices = useMemo(() => {
        if (!chartData.length) return [];
        let currentAngle = 0;
        const baseInner = 70;
        const baseOuter = 135;
        const stepMax = isSteppedRadius ? 26 : 0;
        const totalSlices = chartData.length;

        return chartData.map((d, idx) => {
            const sweep = Math.max(0.01, (d.pct / 100) * 360);
            const startAngle = currentAngle;
            const endAngle = currentAngle + sweep;
            currentAngle = endAngle;

            const radiusBonus = isSteppedRadius ? ((totalSlices - 1 - idx) / Math.max(totalSlices - 1, 1)) * stepMax : 0;
            const rOuter = baseOuter + radiusBonus;
            const rInner = baseInner;

            const midAngle = startAngle + sweep / 2;
            const path = createDonutSlicePath(200, 200, rInner, rOuter, startAngle, endAngle);
            const pal = MACARON_PALETTE[d.colorIdx % MACARON_PALETTE.length];

            return {
                ...d,
                idx,
                startAngle,
                endAngle,
                midAngle,
                rInner,
                rOuter,
                path,
                pal,
            };
        });
    }, [chartData, isSteppedRadius]);

    const activeItem = hoveredIdx !== null ? slices[hoveredIdx] : null;

    return (
        <div className="lpi-card">
            {/* Header Controls */}
            <div className="lpi-header">
                <div className="lpi-title-wrap">
                    <div className="lpi-icon-badge">
                        <PieChart size={22} strokeWidth={2.4} />
                    </div>
                    <div>
                        <div className="lpi-title-row">
                            <h3>{title}</h3>
                            <span className="lpi-cute-pill">
                                <Sparkles size={11} /> {badgeText}
                            </span>
                        </div>
                        <p>{subtitle}</p>
                    </div>
                </div>

                <div className="lpi-actions-row">
                    <button
                        type="button"
                        className={`lpi-toggle-btn ${isSteppedRadius ? 'active' : ''}`}
                        onClick={() => setIsSteppedRadius(!isSteppedRadius)}
                        title="Ubah radius visual: Berjenjang (Stepped) atau Rata"
                    >
                        <SlidersHorizontal size={13} />
                        <span>{isSteppedRadius ? 'Radius Bertingkat' : 'Radius Rata'}</span>
                    </button>

                    <div className="lpi-limit-pills">
                        {[5, 6, 8, 10, 'all'].map((limit) => (
                            <button
                                key={limit}
                                type="button"
                                className={`lpi-limit-pill ${chartLimit === limit ? 'active' : ''}`}
                                onClick={() => setChartLimit(limit)}
                            >
                                {limit === 'all' ? 'Semua' : `Top ${limit}`}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Content: SVG Donut + Interactive Legend List */}
            <div className="lpi-body">
                {/* SVG Visualizer */}
                <div className="lpi-svg-container">
                    <svg viewBox="0 0 400 400" className="lpi-svg">
                        <defs>
                            {slices.map((s, idx) => (
                                <linearGradient
                                    key={idx}
                                    id={`lpi-grad-${idx}`}
                                    x1="0%"
                                    y1="0%"
                                    x2="100%"
                                    y2="100%"
                                >
                                    <stop offset="0%" stopColor={s.pal.gradStart} />
                                    <stop offset="100%" stopColor={s.pal.gradEnd} />
                                </linearGradient>
                            ))}
                            <filter id="lpi-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                <feDropShadow dx="0" dy="8" stdDeviation="6" floodOpacity="0.18" />
                            </filter>
                        </defs>

                        {/* Slices */}
                        <g>
                            {slices.map((s, idx) => {
                                const isHovered = hoveredIdx === idx;
                                const isSelected = selectedId && (selectedId === s.id);
                                const scaleFactor = isHovered || isSelected ? 1.04 : 1;
                                const transformOrigin = '200px 200px';

                                return (
                                    <path
                                        key={idx}
                                        d={s.path}
                                        fill={`url(#lpi-grad-${idx})`}
                                        stroke="#ffffff"
                                        strokeWidth="3.5"
                                        strokeLinejoin="round"
                                        className="lpi-slice"
                                        style={{
                                            transform: `scale(${scaleFactor})`,
                                            transformOrigin,
                                            filter: isHovered || isSelected ? 'url(#lpi-shadow)' : 'none',
                                            cursor: 'pointer',
                                            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
                                            opacity: hoveredIdx !== null && !isHovered ? 0.45 : 1,
                                        }}
                                        onMouseEnter={() => setHoveredIdx(idx)}
                                        onMouseLeave={() => setHoveredIdx(null)}
                                        onClick={() => onSelectItem && onSelectItem(s)}
                                    />
                                );
                            })}
                        </g>

                        {/* Donut Center Hole Details */}
                        <circle cx="200" cy="200" r="66" fill="#ffffff" filter="drop-shadow(0 4px 10px rgba(0,0,0,0.06))" />
                        <g className="lpi-center-text">
                            {activeItem ? (
                                <>
                                    <text x="200" y="185" textAnchor="middle" className="lpi-center-label">
                                        {activeItem.name?.length > 18 ? activeItem.name.slice(0, 16) + '...' : activeItem.name}
                                    </text>
                                    <text x="200" y="210" textAnchor="middle" className="lpi-center-val" fill={activeItem.pal.color}>
                                        {activeItem.pct}%
                                    </text>
                                    <text x="200" y="226" textAnchor="middle" className="lpi-center-sub">
                                        {fmtNum(activeItem.value)} {unitLabel}
                                    </text>
                                </>
                            ) : (
                                <>
                                    <text x="200" y="185" textAnchor="middle" className="lpi-center-label">
                                        TOTAL AKUMULASI
                                    </text>
                                    <text x="200" y="212" textAnchor="middle" className="lpi-center-val" fill="#0f172a">
                                        {fmtNum(totalValue)}
                                    </text>
                                    <text x="200" y="228" textAnchor="middle" className="lpi-center-sub">
                                        {unitLabel}
                                    </text>
                                </>
                            )}
                        </g>
                    </svg>
                </div>

                {/* Legend List */}
                <div className="lpi-legend-list">
                    {slices.map((s, idx) => {
                        const meta = getLogistikCuteMeta(s.name, isUnitMode);
                        const isHovered = hoveredIdx === idx;
                        const isSelected = selectedId && (selectedId === s.id);

                        return (
                            <div
                                key={idx}
                                className={`lpi-legend-card ${isHovered ? 'hovered' : ''} ${isSelected ? 'selected' : ''}`}
                                style={{
                                    borderColor: isHovered || isSelected ? s.pal.color : undefined,
                                }}
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                onClick={() => onSelectItem && onSelectItem(s)}
                            >
                                <div
                                    className="lpi-legend-badge"
                                    style={{
                                        background: s.pal.bg,
                                        color: s.pal.text,
                                        borderColor: s.pal.border,
                                    }}
                                >
                                    <meta.icon size={15} strokeWidth={2.4} />
                                </div>

                                <div className="lpi-legend-info">
                                    <div className="lpi-legend-title-row">
                                        <span className="lpi-legend-name" title={s.name}>
                                            {s.name}
                                        </span>
                                        <span
                                            className="lpi-pct-badge"
                                            style={{
                                                background: s.pal.bg,
                                                color: s.pal.text,
                                                borderColor: s.pal.border,
                                            }}
                                        >
                                            {s.pct}%
                                        </span>
                                    </div>
                                    <div className="lpi-legend-sub-row">
                                        <span className="lpi-val-text">
                                            <strong>{fmtNum(s.value)}</strong> {s.satuan || unitLabel}
                                        </span>
                                        {s.sublabel && <span className="lpi-subtext">• {s.sublabel}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
