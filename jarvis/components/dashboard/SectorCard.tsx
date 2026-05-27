"use client";
import Link from "next/link";
import { SparkLine } from "@/components/charts/SparkLine";
import { scoreColor, scoreRingColor, scoreBgColor } from "@/lib/utils";
import { SectorCardData } from "@/types";

const SECTOR_ICONS: Record<string, string> = {
  sleep: "😴",
  workout: "💪",
  stimulants: "☕",
  macros: "🥗",
  supplements: "💊",
  finances: "💰",
  health: "❤️",
  entrepreneurial: "🚀",
};

interface SectorCardProps {
  data: SectorCardData;
}

export function SectorCard({ data }: SectorCardProps) {
  const { name, label, score, sparkline, topMetric, topMetricValue } = data;
  const color = scoreRingColor(score);
  const textColor = scoreColor(score);
  const bgStyle = scoreBgColor(score);

  return (
    <Link href={`/sector/${name}`} className="block">
      <div className={`rounded-xl border p-4 transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer ${bgStyle}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-xl mb-0.5">{SECTOR_ICONS[name]}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${textColor}`}>{Math.round(score)}</div>
        </div>

        {/* Sparkline */}
        <div className="mb-3">
          <SparkLine data={sparkline} color={color} height={36} />
        </div>

        {/* Top metric */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">{topMetric}</span>
          <span className="text-zinc-300 font-medium">{topMetricValue}</span>
        </div>
      </div>
    </Link>
  );
}
