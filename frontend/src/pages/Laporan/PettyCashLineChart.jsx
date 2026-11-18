import React, { useMemo, useState } from 'react';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
} from 'recharts';
import './PettyCashLineChart.css';

const fmtRp = (v) => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

const fmtCompactRp = (v) => {
    const n = Number(v || 0);
    if (n === 0) return 'Rp 0';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
    if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')} jt`;
    if (abs >= 1_000) return `${sign}Rp ${Math.round(abs / 1_000)} rb`;
    return `${sign}Rp ${abs}`;
};

const fmtShortDate = (iso) => {
    if (!iso) return '-';
    const parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

function ChartTooltip({ active, payload, label, mode }) {
    if (!active || !payload || !payload.length) return null;
    const row = payload[0]?.payload;

    return (
        <div className="lpc-chart-tooltip">
            <div className="lpc-chart-tooltip-title">
                {mode === 'balance' ? (row?.waktu || label) : label}
            </div>
            {mode === 'balance' && row?.keterangan && (
                <div className="lpc-chart-tooltip-sub">{row.keterangan}</div>
            )}
            <div className="lpc-chart-tooltip-rows">
                {payload.map((entry, idx) => (
                    <div key={idx} className="lpc-chart-tooltip-row">
                        <span className="lpc-chart-tooltip-key">
                            <span
                                className="lpc-chart-tooltip-dot"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span>{entry.name}</span>
                        </span>
                        <strong className="lpc-chart-tooltip-val">{fmtRp(entry.value)}</strong>
                    </div>
                ))}
                {mode === 'balance' && row && (row.masuk > 0 || row.keluar > 0) && (
                    <div className="lpc-chart-tooltip-row lpc-chart-tooltip-delta">
                        <span className="lpc-chart-tooltip-key">
                            <span>Mutasi</span>
                        </span>
                        <strong
                            className="lpc-chart-tooltip-val"
                            style={{ color: row.masuk > 0 ? '#10b981' : '#ef4444' }}
                        >
                            {row.masuk > 0 ? `+${fmtRp(row.masuk)}` : `-${fmtRp(row.keluar)}`}
                        </strong>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Line Chart untuk Tab 1 ("Tren Pengeluaran & Arus Kas"):
 * Switch antara agregasi Harian dalam periode filter & Tren 6 Bulan Terakhir (data.grafik)
 */
export function PettyCashExpenseTrendChart({
    rekapMutasi = [],
    grafik = [],
    dari,
    sampai,
}) {
    const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'monthly'

    const dailyData = useMemo(() => {
        if (!rekapMutasi.length) return [];
        const map = new Map();
        rekapMutasi.forEach((m) => {
            const key = m.tanggal || String(m.waktu || '').slice(0, 10);
            if (!key) return;
            if (!map.has(key)) {
                map.set(key, {
                    tanggal: key,
                    label: fmtShortDate(key),
                    keluar: 0,
                    masuk: 0,
                    transaksi: 0,
                });
            }
            const cur = map.get(key);
            cur.keluar += Number(m.keluar || 0);
            cur.masuk += Number(m.masuk || 0);
            cur.transaksi += 1;
        });
        return Array.from(map.values()).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    }, [rekapMutasi]);

    const monthlyData = useMemo(() => {
        return (grafik || []).map((g) => ({
            label: g.bulan,
            total: Number(g.total || 0),
            petty_cash: Number(g.petty_cash || 0),
            reimbursement: Number(g.reimbursement || 0),
        }));
    }, [grafik]);

    const hasDaily = dailyData.length > 0;
    const effectiveMode = viewMode === 'daily' && !hasDaily && monthlyData.length > 0 ? 'monthly' : viewMode;
    const chartRows = effectiveMode === 'daily' ? dailyData : monthlyData;

    if (!dailyData.length && !monthlyData.length) {
        return null;
    }

    return (
        <section className="lpc-line-section no-print" aria-label="Grafik Tren Pengeluaran">
            <div className="lpc-line-header">
                <div className="lpc-line-title-wrap">
                    <h3>Tren Pengeluaran Kas Kecil</h3>
                    <p>
                        {effectiveMode === 'daily'
                            ? `Pergerakan belanja & top-up harian periode ${fmtShortDate(dari)} s/d ${fmtShortDate(sampai)}`
                            : 'Perbandingan realisasi Petty Cash & Reimbursement 6 bulan terakhir'}
                    </p>
                </div>

                <div className="lpc-line-controls">
                    <div className="lpc-line-legend">
                        {effectiveMode === 'daily' ? (
                            <>
                                <span className="lpc-line-legend-item">
                                    <span className="lpc-line-dot" style={{ background: '#635bff' }} />
                                    <span>Kas Keluar (Belanja)</span>
                                </span>
                                <span className="lpc-line-legend-item">
                                    <span className="lpc-line-dot" style={{ background: '#10b981' }} />
                                    <span>Top-Up Masuk</span>
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="lpc-line-legend-item">
                                    <span className="lpc-line-dot" style={{ background: '#635bff' }} />
                                    <span>Total Beban</span>
                                </span>
                                <span className="lpc-line-legend-item">
                                    <span className="lpc-line-dot" style={{ background: '#0ea5e9' }} />
                                    <span>Petty Cash</span>
                                </span>
                                <span className="lpc-line-legend-item">
                                    <span className="lpc-line-dot" style={{ background: '#10b981' }} />
                                    <span>Reimbursement</span>
                                </span>
                            </>
                        )}
                    </div>

                    <div className="mpi-limit-pills" role="tablist" aria-label="Mode tampilan grafik tren">
                        <button
                            type="button"
                            className={`mpi-limit-pill ${effectiveMode === 'daily' ? 'active' : ''}`}
                            onClick={() => setViewMode('daily')}
                            disabled={!hasDaily}
                        >
                            Harian Periode
                        </button>
                        <button
                            type="button"
                            className={`mpi-limit-pill ${effectiveMode === 'monthly' ? 'active' : ''}`}
                            onClick={() => setViewMode('monthly')}
                        >
                            6 Bulan
                        </button>
                    </div>
                </div>
            </div>

            <div className="lpc-line-canvas">
                <ResponsiveContainer width="100%" height={240}>
                    {effectiveMode === 'daily' ? (
                        <AreaChart data={chartRows} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="lpcKeluarFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#635bff" stopOpacity={0.18} />
                                    <stop offset="100%" stopColor="#635bff" stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="var(--lpc-border)" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                                minTickGap={18}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={fmtCompactRp}
                                tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                                width={76}
                            />
                            <Tooltip content={<ChartTooltip mode="trend" />} />
                            <Area
                                type="monotone"
                                dataKey="keluar"
                                name="Kas Keluar"
                                stroke="#635bff"
                                strokeWidth={2}
                                fill="url(#lpcKeluarFill)"
                                dot={{ r: 2.5, fill: '#635bff', strokeWidth: 0 }}
                                activeDot={{ r: 5, fill: '#635bff', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="masuk"
                                name="Top-Up Masuk"
                                stroke="#10b981"
                                strokeWidth={1.75}
                                strokeDasharray="4 3"
                                fill="none"
                                dot={false}
                                activeDot={{ r: 4.5, fill: '#10b981', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    ) : (
                        <LineChart data={chartRows} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                            <CartesianGrid vertical={false} stroke="var(--lpc-border)" />
                            <XAxis
                                dataKey="label"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                            />
                            <YAxis
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={fmtCompactRp}
                                tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                                width={76}
                            />
                            <Tooltip content={<ChartTooltip mode="trend" />} />
                            <Line
                                type="monotone"
                                dataKey="total"
                                name="Total Beban"
                                stroke="#635bff"
                                strokeWidth={2.2}
                                dot={{ r: 3, fill: '#635bff', strokeWidth: 0 }}
                                activeDot={{ r: 5.5, fill: '#635bff', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="petty_cash"
                                name="Petty Cash"
                                stroke="#0ea5e9"
                                strokeWidth={1.75}
                                dot={{ r: 2.5, fill: '#0ea5e9', strokeWidth: 0 }}
                                activeDot={{ r: 4.5, fill: '#0ea5e9', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="reimbursement"
                                name="Reimbursement"
                                stroke="#10b981"
                                strokeWidth={1.75}
                                strokeDasharray="4 3"
                                dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }}
                                activeDot={{ r: 4.5, fill: '#10b981', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                            />
                        </LineChart>
                    )}
                </ResponsiveContainer>
            </div>
        </section>
    );
}

/**
 * Line Chart untuk Tab 3 ("Buku Kas & Rekonsiliasi"):
 * Menampilkan pergerakan saldo kasir (saldo_sesudah) secara kronologis
 */
export function PettyCashBalanceChart({
    rekapMutasi = [],
    saldoAwal = 0,
    saldoAkhir = 0,
    dari,
}) {
    const balanceData = useMemo(() => {
        if (!rekapMutasi.length) return [];
        const points = [
            {
                label: fmtShortDate(dari),
                waktu: `Saldo Awal (${fmtShortDate(dari)})`,
                saldo_sesudah: Number(saldoAwal || 0),
                masuk: 0,
                keluar: 0,
                keterangan: 'Posisi saldo kasir awal periode',
            },
        ];

        rekapMutasi.forEach((m) => {
            points.push({
                label: fmtShortDate(m.tanggal) || String(m.waktu || '').slice(0, 5),
                waktu: m.waktu,
                saldo_sesudah: Number(m.saldo_sesudah || 0),
                masuk: Number(m.masuk || 0),
                keluar: Number(m.keluar || 0),
                keterangan: m.keterangan,
            });
        });

        return points;
    }, [rekapMutasi, saldoAwal, dari]);

    if (!balanceData.length) {
        return null;
    }

    return (
        <section className="lpc-line-section no-print" aria-label="Grafik Pergerakan Saldo Kasir">
            <div className="lpc-line-header">
                <div className="lpc-line-title-wrap">
                    <h3>Pergerakan Saldo Kasir (Running Balance)</h3>
                    <p>Kurva fluktuasi saldo kas kecil setiap kali terjadi transaksi belanja maupun top-up</p>
                </div>

                <div className="lpc-balance-summary">
                    <span>Saldo Awal: <strong>{fmtRp(saldoAwal)}</strong></span>
                    <span className="lpc-balance-sep">&rarr;</span>
                    <span>Saldo Akhir: <strong className="lpc-balance-end">{fmtRp(saldoAkhir)}</strong></span>
                </div>
            </div>

            <div className="lpc-line-canvas">
                <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={balanceData} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                        <defs>
                            <linearGradient id="lpcBalanceFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#635bff" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#635bff" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke="var(--lpc-border)" />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                            minTickGap={24}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={fmtCompactRp}
                            tick={{ fill: 'var(--lpc-text-muted)', fontSize: 11 }}
                            width={76}
                        />
                        <Tooltip content={<ChartTooltip mode="balance" />} />
                        <Area
                            type="monotone"
                            dataKey="saldo_sesudah"
                            name="Saldo Kasir"
                            stroke="#635bff"
                            strokeWidth={2}
                            fill="url(#lpcBalanceFill)"
                            dot={balanceData.length <= 45 ? { r: 2.5, fill: '#635bff', strokeWidth: 0 } : false}
                            activeDot={{ r: 5, fill: '#635bff', stroke: 'var(--lpc-canvas)', strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </section>
    );
}
