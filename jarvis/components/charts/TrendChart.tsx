"use client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip,
} from "recharts";
import { format, parseISO } from "date-fns";

interface TrendChartProps {
  data: Array<{ date: string; value: number; [key: string]: unknown }>;
  dataKey?: string;
  color?: string;
  label?: string;
  domain?: [number, number];
}

export function TrendChart({
  data,
  dataKey = "value",
  color = "#60a5fa",
  label = "Score",
  domain,
}: TrendChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    dateLabel: format(parseISO(d.date), "MMM d"),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="dateLabel" tick={{ fill: "#71717a", fontSize: 11 }} tickLine={false} />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          domain={domain ?? ["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#a1a1aa" }}
          itemStyle={{ color: "#f4f4f5" }}
        />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          dot={{ fill: color, r: 3 }}
          activeDot={{ r: 5 }}
          name={label}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
