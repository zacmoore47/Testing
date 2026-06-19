"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  HEALTH: "💪 Health",
  WEALTH: "💰 Wealth",
  LEARNING: "📚 Learning",
  MIND: "🧘 Mind",
};

const CATEGORY_ORDER = ["HEALTH", "WEALTH", "LEARNING", "MIND"];

interface Habit {
  id: string;
  title: string;
  category: string;
  points: number;
  type: string;
  frequency: string;
  unit: string | null;
  minValue: number | null;
  loggedToday: boolean;
  logEntryId: string | null;
  pointsEarnedToday: number;
  streak: number;
}

interface Props {
  habits: Habit[];
  todayTotal: number;
}

export default function LogClient({ habits, todayTotal }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loggedMap, setLoggedMap] = useState<Map<string, string>>(
    new Map(habits.filter((h) => h.loggedToday && h.logEntryId).map((h) => [h.id, h.logEntryId!]))
  );
  const [pointsByHabit, setPointsByHabit] = useState<Map<string, number>>(
    new Map(habits.filter((h) => h.loggedToday).map((h) => [h.id, h.pointsEarnedToday]))
  );
  const [numericModal, setNumericModal] = useState<Habit | null>(null);
  const [numericValue, setNumericValue] = useState("");
  const [note, setNote] = useState("");
  const [todayPts, setTodayPts] = useState(todayTotal);
  const [flash, setFlash] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  async function logHabit(habitId: string, value?: number, note?: string) {
    setLoading(habitId);
    try {
      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ habitId, value, note }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) setFlash("Already logged today!");
        return;
      }
      setLoggedMap((prev) => new Map(prev).set(habitId, data.logEntryId));
      setPointsByHabit((prev) => new Map(prev).set(habitId, data.pointsEarned));
      setTodayPts((prev) => prev + data.pointsEarned);
      setFlash(`+${data.pointsEarned} pts${data.streak?.current > 1 ? ` 🔥 ${data.streak.current} day streak!` : ""}`);
      setTimeout(() => setFlash(null), 3000);
      startTransition(() => router.refresh());
    } finally {
      setLoading(null);
    }
  }

  async function undoHabit(habitId: string) {
    const logEntryId = loggedMap.get(habitId);
    if (!logEntryId) return;
    setLoading(habitId);
    try {
      const res = await fetch("/api/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logEntryId }),
      });
      if (!res.ok) return;
      const earned = pointsByHabit.get(habitId) ?? 0;
      setLoggedMap((prev) => {
        const next = new Map(prev);
        next.delete(habitId);
        return next;
      });
      setTodayPts((prev) => prev - earned);
      setFlash("Undone");
      setTimeout(() => setFlash(null), 2000);
      startTransition(() => router.refresh());
    } finally {
      setLoading(null);
    }
  }

  function handleHabitTap(habit: Habit) {
    if (loggedMap.has(habit.id)) return;
    if (habit.type === "NUMERIC") {
      setNumericModal(habit);
      setNumericValue("");
      setNote("");
    } else {
      logHabit(habit.id);
    }
  }

  async function submitNumeric() {
    if (!numericModal) return;
    await logHabit(numericModal.id, parseFloat(numericValue), note || undefined);
    setNumericModal(null);
  }

  const grouped = CATEGORY_ORDER.reduce<Record<string, Habit[]>>((acc, cat) => {
    acc[cat] = habits.filter((h) => h.category === cat);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-2">
        <h2 className="text-xl font-black">Today's Habits</h2>
        <div className="text-right">
          <div className="text-yellow-400 font-black text-xl">+{todayPts}</div>
          <div className="text-white/40 text-xs">pts today</div>
        </div>
      </div>

      {/* Flash message */}
      {flash && (
        <div className="bg-green-500/20 border border-green-500/40 rounded-xl px-4 py-3 text-green-400 font-bold text-center animate-pulse">
          {flash}
        </div>
      )}

      {/* Habit groups */}
      {CATEGORY_ORDER.map((cat) => {
        const catHabits = grouped[cat];
        if (!catHabits?.length) return null;
        return (
          <div key={cat}>
            <h3 className="text-xs font-bold text-white/40 tracking-widest mb-2 px-1">
              {CATEGORY_LABELS[cat]}
            </h3>
            <div className="space-y-2">
              {catHabits.map((habit) => {
                const done = loggedMap.has(habit.id);
                const isLoading = loading === habit.id;
                return (
                  <div
                    key={habit.id}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border transition ${
                      done
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                    }`}
                  >
                    <button
                      onClick={() => handleHabitTap(habit)}
                      disabled={done || isLoading}
                      className="flex-1 flex items-center gap-3 text-left active:scale-95 transition disabled:active:scale-100"
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        done ? "border-green-500 bg-green-500" : "border-white/30"
                      }`}>
                        {done && <span className="text-black text-xs font-black">✓</span>}
                        {isLoading && <span className="text-white text-xs animate-spin">○</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium text-sm ${done ? "line-through text-white/40" : ""}`}>
                          {habit.title}
                        </div>
                        {habit.streak > 0 && !done && (
                          <div className="text-xs text-orange-400 mt-0.5">🔥 {habit.streak} day streak</div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className={`text-sm font-bold ${done ? "text-white/30" : "text-yellow-400"}`}>
                          +{habit.points}
                        </div>
                        {habit.type === "NUMERIC" && (
                          <div className="text-xs text-white/30">{habit.unit}</div>
                        )}
                        {habit.type === "MILESTONE" && (
                          <div className="text-xs text-purple-400">milestone</div>
                        )}
                      </div>
                    </button>
                    {done && (
                      <button
                        onClick={() => undoHabit(habit.id)}
                        disabled={isLoading}
                        className="text-xs text-red-400/70 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-400/10 transition flex-shrink-0"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Numeric input modal */}
      {numericModal && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-black text-lg">{numericModal.title}</h3>
            <div>
              <label className="text-white/50 text-sm mb-1 block">
                {numericModal.unit ? `Value (${numericModal.unit})` : "Value"}
                {numericModal.minValue && (
                  <span className="text-white/30"> — min {numericModal.minValue}</span>
                )}
              </label>
              <input
                type="number"
                value={numericValue}
                onChange={(e) => setNumericValue(e.target.value)}
                placeholder={numericModal.minValue?.toString() ?? "0"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400"
                autoFocus
              />
            </div>
            <div>
              <label className="text-white/50 text-sm mb-1 block">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setNumericModal(null)}
                className="flex-1 bg-white/10 rounded-xl py-3 text-sm font-bold"
              >
                Cancel
              </button>
              <button
                onClick={submitNumeric}
                disabled={!numericValue}
                className="flex-1 bg-yellow-400 text-black rounded-xl py-3 text-sm font-bold disabled:opacity-50"
              >
                Log +{numericModal.points} pts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
