"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSeriesPoint } from "@/lib/dashboard/types";
import { formatCompact, formatCurrency } from "@/lib/format";

export function UsageChart({ data }: { data: DashboardSeriesPoint[] }) {
  if (data.length === 0) return <div className="muted mono">No usage has landed in this range yet.</div>;
  return (
    <>
      <div style={{ height: 310, width: "100%" }} aria-hidden="true">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 12, right: 10, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="input-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--teal)" stopOpacity={0.42}/><stop offset="95%" stopColor="var(--teal)" stopOpacity={0}/></linearGradient>
              <linearGradient id="output-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--accent)" stopOpacity={0.34}/><stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
            <YAxis tickFormatter={formatCompact} tick={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11 }} formatter={(value, name) => [name === "cost" ? formatCurrency(Number(value), 4) : formatCompact(Number(value)), String(name)]} />
            <Area type="monotone" dataKey="input" stackId="tokens" stroke="var(--teal)" fill="url(#input-fill)" strokeWidth={2} />
            <Area type="monotone" dataKey="output" stackId="tokens" stroke="var(--accent)" fill="url(#output-fill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="sr-only"><summary>Usage chart data</summary><ul>{data.map((point) => <li key={point.label}>{point.label}: {point.input} input tokens, {point.output} output tokens, {point.cache} cached tokens, {formatCurrency(point.cost)} cost.</li>)}</ul></details>
    </>
  );
}

export function CostChart({ data }: { data: DashboardSeriesPoint[] }) {
  if (data.length === 0) return <div className="muted mono">No priced usage has landed in this range yet.</div>;
  return (
    <>
      <div style={{ height: 310, width: "100%" }} aria-hidden="true">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 12, right: 10, left: -5, bottom: 0 }}>
            <defs>
              <linearGradient id="cost-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--accent)" stopOpacity={0.45}/><stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid stroke="var(--line)" strokeDasharray="2 5" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={30} />
            <YAxis tickFormatter={(value) => formatCurrency(Number(value), 2)} tick={{ fill: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10 }} tickLine={false} axisLine={false} width={64} />
            <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--line-strong)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11 }} formatter={(value) => [formatCurrency(Number(value), 4), "cost"]} />
            <Area type="monotone" dataKey="cost" stroke="var(--accent)" fill="url(#cost-fill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="sr-only"><summary>Cost chart data</summary><ul>{data.map((point) => <li key={point.label}>{point.label}: {formatCurrency(point.cost, 4)}.</li>)}</ul></details>
    </>
  );
}
