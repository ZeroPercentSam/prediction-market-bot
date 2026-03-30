"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";

interface ModelAccuracyProps {
  data: { model: string; accuracy: number; trades: number }[];
}

const MODEL_COLORS: Record<string, string> = {
  claude: "#a78bfa",
  "gpt-4o": "#22c55e",
  grok: "#3b82f6",
  gemini: "#eab308",
  deepseek: "#ef4444",
};

function getModelColor(model: string): string {
  const key = Object.keys(MODEL_COLORS).find((k) =>
    model.toLowerCase().includes(k)
  );
  return key ? MODEL_COLORS[key] : "#71717a";
}

export function ModelAccuracy({ data }: ModelAccuracyProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-700">
        <p className="text-sm text-zinc-500">No data yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis
          dataKey="model"
          stroke="#71717a"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
        />
        <YAxis
          stroke="#71717a"
          tick={{ fill: "#a1a1aa", fontSize: 12 }}
          domain={[0, 100]}
          tickFormatter={(value) => `${value}%`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "8px",
            color: "#fafafa",
          }}
          formatter={(value, _name, props) => [
            `${value}% (${(props as { payload: { trades: number } }).payload.trades} trades)`,
            "Accuracy",
          ]}
        />
        <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={getModelColor(entry.model)} />
          ))}
          <LabelList
            dataKey="trades"
            position="top"
            formatter={(value) => `n=${value}`}
            style={{ fill: "#a1a1aa", fontSize: 11 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
