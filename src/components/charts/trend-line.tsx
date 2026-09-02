"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Label,
} from "recharts";

interface TrendLineProps {
  data: { month: string; count: number }[];
  color?: string;
  label?: string;
  /** Axis captions, so the reader knows what is being counted */
  xLabel?: string;
  yLabel?: string;
  /** Target or SLA line — the value the series is supposed to stay under */
  reference?: number;
  referenceLabel?: string;
  emptyLabel?: string;
}

export function TrendLine({
  data,
  color = "var(--brand)",
  label = "Count",
  xLabel,
  yLabel,
  reference,
  referenceLabel,
  emptyLabel = "No trend data available",
}: TrendLineProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 20, left: yLabel ? 8 : 0, bottom: xLabel ? 18 : 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: string) => {
            const parts = v.split("-");
            return parts.length === 2 ? `${parts[1]}/${parts[0].slice(2)}` : v;
          }}
        >
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
        {reference !== undefined && (
          <ReferenceLine
            y={reference}
            stroke="var(--risk-medium)"
            strokeDasharray="4 4"
            label={{
              value: referenceLabel ?? String(reference),
              position: "insideTopRight",
              style: { fontSize: 10.5, fill: "var(--risk-medium)" },
            }}
          />
        )}
        <Line
          type="monotone"
          dataKey="count"
          name={label}
          stroke={color}
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
