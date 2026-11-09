"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type TrendPoint = { month: string; label: string; revenue: number; profit: number; occupancy: number | null };

// Palet kategorikal tervalidasi (slot 1 & 2), aman untuk buta warna.
const BLUE = "#2a78d6";
const ORANGE = "#eb6834";
const INK = "#57534e";   // teks sekunder
const GRID = "#e7e5e4";  // garis bantu yang samar

const juta = (v: number) => `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
const rupiah = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const axis = { tick: { fill: INK, fontSize: 12 }, tickLine: false, axisLine: false } as const;

export function TrendCharts({ data }: { data: TrendPoint[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="card">
        <h2 className="font-semibold">Pendapatan kamar vs laba bersih</h2>
        <p className="mb-3 text-xs text-stone-500">12 bulan terakhir, semua villa. Laba sudah dikurangi komisi, pengeluaran, dan biaya bersama.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={2} barCategoryGap="25%" margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} tickFormatter={juta} width={56} />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(v: number, name: string) => [rupiah(v), name]}
                contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 13 }}
              />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13, color: INK }} />
              <Bar dataKey="revenue" name="Pendapatan kamar" fill={BLUE} radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" name="Laba bersih" fill={ORANGE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold">Okupansi</h2>
        <p className="mb-3 text-xs text-stone-500">Persentase malam terisi, semua villa digabung.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="label" {...axis} />
              <YAxis {...axis} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />
              <Tooltip
                formatter={(v: number) => [`${v}%`, "Okupansi"]}
                contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 13 }}
              />
              <Line type="monotone" dataKey="occupancy" name="Okupansi" stroke={BLUE} strokeWidth={2}
                dot={{ r: 4, fill: BLUE, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <details className="card xl:col-span-2">
        <summary className="cursor-pointer text-sm font-medium">Lihat sebagai tabel</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left text-stone-500">
              <tr><th className="py-1">Bulan</th><th className="text-right">Okupansi</th><th className="text-right">Pendapatan kamar</th><th className="text-right">Laba bersih</th></tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month} className="border-t border-stone-100">
                  <td className="py-1">{d.label}</td>
                  <td className="text-right">{d.occupancy ?? "–"}%</td>
                  <td className="text-right">{rupiah(d.revenue)}</td>
                  <td className="text-right">{rupiah(d.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
