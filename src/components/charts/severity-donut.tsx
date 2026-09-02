"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { severity, type Severity } from "@/lib/risk";

interface SeverityDonutProps {
  data: Record<string, number>;
  emptyLabel?: string;
}

export function SeverityDonut({ data, emptyLabel = "No vulnerabilities" }: SeverityDonutProps) {
  const chartData = Object.entries(data)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => ({
      name: key,
      value: count,
      color: severity[key as Severity]?.chart ?? severity.INFORMATIONAL.chart,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs capitalize">{value.toLowerCase()}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
