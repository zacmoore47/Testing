"use client";
import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import { SparklineData } from "@/types";

interface SparkLineProps {
  data: SparklineData[];
  color?: string;
  height?: number;
}

export function SparkLine({ data, color = "#60a5fa", height = 40 }: SparkLineProps) {
  if (!data || data.length === 0) {
    return <div className="h-10 flex items-center justify-center text-zinc-600 text-xs">No data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-200">
                {payload[0].value}
              </div>
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
