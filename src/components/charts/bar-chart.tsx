"use client";

import {
  BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Label, ReferenceLine,
} from "recharts";

interface StackedBarChartProps {
  data: { name: string; [key: string]: string | number }[];
  bars: { dataKey: string; color: string; label: string }[];
  height?: number;
  /**
   * Stack only when the series sum to something meaningful. Assessments and
   * vulnerabilities are different units of work, so they are shown side by side.
   */
  stacked?: boolean;
  xLabel?: string;
  yLabel?: string;
  emptyLabel?: string;
}

export function StackedBarChart({
  data,
  bars,
  height = 220,
  stacked = false,
  xLabel,
  yLabel,
  emptyLabel = "No data available",
}: StackedBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        margin={{ top: 8, right: 20, left: yLabel ? 8 : 0, bottom: xLabel ? 18 : 5 }}
        barGap={stacked ? 0 : 2}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }}>
          {xLabel && (
            <Label value={xLabel} position="insideBottom" offset={-12} style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          )}
        </XAxis>
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false}>
          {yLabel && (
            <Label
              value={yLabel}
              angle={-90}
              position="insideLeft"
              style={{ fontSize: 11, fill: "var(--muted-foreground)", textAnchor: "middle" }}
            />
          )}
        </YAxis>
        <Tooltip />
        <Legend formatter={(v: string) => <span className="text-xs">{v}</span>} />
        {bars.map((bar) => (
          <Bar
            key={bar.dataKey}
            dataKey={bar.dataKey}
            fill={bar.color}
            name={bar.label}
            stackId={stacked ? "a" : undefined}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}

interface HorizontalBarChartProps {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  xLabel?: string;
  /** Target or SLA line, drawn across the value axis */
  reference?: number;
  referenceLabel?: string;
  emptyLabel?: string;
}

export function HorizontalBarChart({
  data,
  height = 220,
  xLabel,
  reference,
  referenceLabel,
  emptyLabel = "No data available",
}: HorizontalBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 20, left: 80, bottom: xLabel ? 18 : 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false}>
          {xLabel && (
            <Label value={xLabel} position="insideBottom" offset={-12} style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
          )}
        </XAxis>
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
        <Tooltip />
        {reference !== undefined && (
          <ReferenceLine
            x={reference}
            stroke="var(--risk-medium)"
            strokeDasharray="4 4"
            label={{
              value: referenceLabel ?? String(reference),
              position: "top",
              style: { fontSize: 10.5, fill: "var(--risk-medium)" },
            }}
          />
        )}
        <Bar dataKey="value" fill="var(--brand)" radius={[0, 4, 4, 0]} />
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
