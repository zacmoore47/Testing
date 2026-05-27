import { Flame } from "lucide-react";

interface StreakProps {
  label: string;
  streak: number;
}

export function StreakIndicator({ label, streak }: StreakProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
      <Flame className={`h-4 w-4 ${streak > 0 ? "text-orange-400" : "text-zinc-600"}`} />
      <div>
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-sm font-bold text-zinc-100">
          {streak} <span className="text-xs font-normal text-zinc-400">day{streak !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
