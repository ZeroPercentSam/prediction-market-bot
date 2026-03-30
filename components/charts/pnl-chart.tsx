"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";

interface PnlChartProps {
  data: { date: string; pnl: number }[];
}

export function PnlChart({ data }: PnlChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-zinc-700">
        <p className="text-sm text-zinc-500">No data yet</p>
      </div>
    );
  }

  const lastPnl = data[data.length - 1].pnl;
  const lineColor = lastPnl >= 0 ? "#22c55e" : "#ef4444";

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="date"
          stroke="#71717a"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          tickFormatter={(value) => format(new Date(value), "MMM d")}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          tickFormatter={(value) => `$${value.toLocaleString()}`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "8px",
            color: "#fafafa",
          }}
          labelFormatter={(value) => format(new Date(value), "MMM d, yyyy")}
          formatter={(value) => {
            const num = Number(value);
            return [
              `${num >= 0 ? "+" : ""}$${num.toLocaleString()}`,
              "Cumulative P&L",
            ];
          }}
        />
        <ReferenceLine y={0} stroke="#71717a" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="pnl"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: lineColor }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
