"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ForecastPoint = { label: string; otb: number; pickup: number };

const BLUE = "#2a78d6";   // sudah dipesan
const ORANGE = "#eb6834"; // perkiraan tambahan
const INK = "#57534e";
const GRID = "#e7e5e4";
const juta = (v: number) => `${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 0 })} jt`;
const rupiah = (v: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);
const axis = { tick: { fill: INK, fontSize: 12 }, tickLine: false, axisLine: false } as const;

export function ForecastChart({ data }: { data: ForecastPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="30%" margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} tickFormatter={juta} width={56} />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} formatter={(v: number, name: string) => [rupiah(v), name]}
            contentStyle={{ borderRadius: 8, borderColor: GRID, fontSize: 13 }} />
          <Legend iconType="square" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: INK }}>{v}</span>} />
          <Bar dataKey="otb" name="Sudah dipesan" stackId="a" fill={BLUE} stroke="#fff" strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="pickup" name="Perkiraan tambahan" stackId="a" fill={ORANGE} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
