"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CAT_EMOJI: Record<string, string> = {
  HEALTH: "💪",
  WEALTH: "💰",
  LEARNING: "📚",
  MIND: "🧘",
};

interface LogRow {
  id: string;
  date: string;
  pointsEarned: number;
  habitTitle: string;
  category: string;
}

export default function HistoryClient({ logs: initialLogs }: { logs: LogRow[] }) {
  const router = useRouter();
  const [logs, setLogs] = useState(initialLogs);
  const [undoing, setUndoing] = useState<string | null>(null);

  async function undo(id: string) {
    setUndoing(id);
    try {
      const res = await fetch("/api/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logEntryId: id }),
      });
      if (!res.ok) return;
      setLogs((prev) => prev.filter((l) => l.id !== id));
      router.refresh();
    } finally {
      setUndoing(null);
    }
  }

  const grouped: Record<string, LogRow[]> = {};
  for (const log of logs) {
    const dateStr = log.date.slice(0, 10);
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(log);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black py-2">History</h2>
      {Object.entries(grouped).map(([date, dayLogs]) => {
        const total = dayLogs.reduce((sum, l) => sum + l.pointsEarned, 0);
        const label = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        return (
          <div key={date} className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">{label}</div>
              <div className="text-yellow-400 font-bold text-sm">+{total} pts</div>
            </div>
            <div className="space-y-1">
              {dayLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-sm">
                  <span>{CAT_EMOJI[log.category] ?? "•"}</span>
                  <span className="flex-1 text-white/70">{log.habitTitle}</span>
                  <span className="text-white/40">+{log.pointsEarned}</span>
                  <button
                    onClick={() => undo(log.id)}
                    disabled={undoing === log.id}
                    className="text-xs text-red-400/60 hover:text-red-400 px-2 py-0.5 rounded hover:bg-red-400/10 transition"
                  >
                    Undo
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {logs.length === 0 && (
        <div className="text-center text-white/30 py-12">No logs yet. Start logging!</div>
      )}
    </div>
  );
}
