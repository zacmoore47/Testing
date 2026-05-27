"use client";
import { useState, useEffect, useCallback } from "react";
import { format, subDays, startOfDay, parseISO, eachDayOfInterval } from "date-fns";
import { Plus, Flame } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HabitRow } from "@/types";

const COLORS = ["#60a5fa", "#34d399", "#f87171", "#fbbf24", "#a78bfa", "#fb923c", "#e879f9"];

interface AddHabitModalProps {
  onClose: () => void;
  onSave: () => void;
}

function AddHabitModal({ onClose, onSave }: AddHabitModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon] = useState("check");
  const [frequency, setFrequency] = useState("Daily");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, icon, targetFrequency: frequency }),
      });
      onSave();
      onClose();
      toast.success("Habit created");
    } catch {
      toast.error("Failed to create habit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <h3 className="text-base font-semibold mb-4">New Habit</h3>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="Morning walk, No phone after 10pm..."
              autoFocus
            />
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white/30" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label>Frequency</Label>
            <div className="flex gap-2 mt-1.5">
              {["Daily", "Weekdays"].map((f) => (
                <button
                  key={f}
                  onClick={() => setFrequency(f)}
                  className={`px-3 py-1 rounded-md text-sm border transition-colors ${
                    frequency === f ? "border-zinc-400 bg-zinc-700 text-zinc-100" : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Create"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HabitTracker() {
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [view, setView] = useState<"week" | "grid">("week");
  const today = startOfDay(new Date());
  const todayStr = format(today, "yyyy-MM-dd");

  const load = useCallback(async () => {
    const res = await fetch("/api/habits");
    const data = await res.json();
    setHabits(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleCompletion(habitId: number, dateStr: string) {
    const res = await fetch(`/api/habits/${habitId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: dateStr }),
    });
    const data = await res.json();
    setHabits((prev) =>
      prev.map((h) => {
        if (h.id !== habitId) return h;
        const existing = h.completions.find((c) => format(parseISO(c.date), "yyyy-MM-dd") === dateStr);
        if (data.completed) {
          if (existing) return h;
          return {
            ...h,
            completions: [...h.completions, { id: Date.now(), habitId, date: dateStr, completed: true, createdAt: new Date().toISOString() }],
          };
        } else {
          return { ...h, completions: h.completions.filter((c) => format(parseISO(c.date), "yyyy-MM-dd") !== dateStr) };
        }
      })
    );
  }

  function isCompleted(habit: HabitRow, dateStr: string): boolean {
    return habit.completions.some(
      (c) => format(parseISO(c.date), "yyyy-MM-dd") === dateStr && c.completed
    );
  }

  function calcStreak(habit: HabitRow): number {
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = format(subDays(today, i), "yyyy-MM-dd");
      if (isCompleted(habit, d)) streak++;
      else break;
    }
    return streak;
  }

  function calcRate30(habit: HabitRow): number {
    let done = 0;
    for (let i = 0; i < 30; i++) {
      if (isCompleted(habit, format(subDays(today, i), "yyyy-MM-dd"))) done++;
    }
    return Math.round((done / 30) * 100);
  }

  const last7 = Array.from({ length: 7 }, (_, i) => format(subDays(today, 6 - i), "yyyy-MM-dd"));

  // 60-day grid dates
  const gridDays = eachDayOfInterval({ start: subDays(today, 59), end: today }).map((d) => format(d, "yyyy-MM-dd"));

  const completedToday = habits.filter((h) => isCompleted(h, todayStr)).length;
  const habitScore = habits.length > 0 ? Math.round((completedToday / habits.length) * 100) : 0;

  if (habits.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Habits</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowModal(true)} className="gap-1 text-zinc-400">
            <Plus className="h-4 w-4" /> Add habit
          </Button>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 py-10 text-center">
          <p className="text-zinc-500 text-sm mb-3">No habits yet.</p>
          <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>Add your first habit</Button>
        </div>
        {showModal && <AddHabitModal onClose={() => setShowModal(false)} onSave={load} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Habits</h2>
          <span className="text-xs text-zinc-500">{completedToday}/{habits.length} today · {habitScore}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md bg-zinc-800 p-0.5">
            {(["week", "grid"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  view === v ? "bg-zinc-700 text-zinc-100" : "text-zinc-500"
                }`}
              >
                {v === "week" ? "7d" : "Grid"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setShowModal(true)} className="gap-1 text-zinc-400 h-7">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {view === "week" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          {/* Header row */}
          <div className="grid border-b border-zinc-800" style={{ gridTemplateColumns: "1fr repeat(7, 2.5rem)" }}>
            <div className="px-4 py-2 text-xs text-zinc-600">Habit</div>
            {last7.map((d) => (
              <div key={d} className={`text-center py-2 text-xs ${d === todayStr ? "text-zinc-200 font-semibold" : "text-zinc-600"}`}>
                {format(parseISO(d), "EEE")[0]}
                <div className={`text-[10px] ${d === todayStr ? "text-zinc-400" : "text-zinc-700"}`}>{format(parseISO(d), "d")}</div>
              </div>
            ))}
          </div>

          {habits.map((habit) => (
            <div
              key={habit.id}
              className="grid items-center border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors"
              style={{ gridTemplateColumns: "1fr repeat(7, 2.5rem)" }}
            >
              <div className="px-4 py-3 flex items-center gap-2 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: habit.color }} />
                <span className="text-sm text-zinc-200 truncate">{habit.name}</span>
                <div className="flex items-center gap-1 ml-auto shrink-0">
                  {calcStreak(habit) > 0 && (
                    <span className="flex items-center gap-0.5 text-xs text-orange-400">
                      <Flame className="h-3 w-3" />{calcStreak(habit)}
                    </span>
                  )}
                  <span className="text-xs text-zinc-600 ml-1">{calcRate30(habit)}%</span>
                </div>
              </div>
              {last7.map((d) => {
                const done = isCompleted(habit, d);
                const isFuture = d > todayStr;
                return (
                  <div key={d} className="flex items-center justify-center py-3">
                    <button
                      onClick={() => !isFuture && toggleCompletion(habit.id, d)}
                      disabled={isFuture}
                      className={`w-6 h-6 rounded-md border transition-all ${
                        done
                          ? "border-transparent"
                          : d === todayStr
                          ? "border-zinc-500 bg-zinc-800 hover:border-zinc-300"
                          : "border-zinc-700 bg-zinc-800/50"
                      } ${isFuture ? "opacity-20 cursor-default" : "cursor-pointer"}`}
                      style={done ? { background: habit.color } : {}}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "grid" && (
        <div className="space-y-3">
          {habits.map((habit) => (
            <div key={habit.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: habit.color }} />
                <span className="text-sm font-medium text-zinc-200">{habit.name}</span>
                <span className="ml-auto text-xs text-zinc-500">{calcRate30(habit)}% last 30d</span>
                {calcStreak(habit) > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-orange-400">
                    <Flame className="h-3 w-3" />{calcStreak(habit)}
                  </span>
                )}
              </div>
              {/* 60-day contribution grid */}
              <div className="flex flex-wrap gap-0.5">
                {gridDays.map((d) => {
                  const done = isCompleted(habit, d);
                  const isFuture = d > todayStr;
                  return (
                    <button
                      key={d}
                      onClick={() => !isFuture && toggleCompletion(habit.id, d)}
                      disabled={isFuture}
                      title={`${d}: ${done ? "done" : "missed"}`}
                      className={`w-3 h-3 rounded-sm transition-opacity ${isFuture ? "opacity-10 cursor-default" : "cursor-pointer hover:opacity-80"}`}
                      style={{ background: done ? habit.color : "#27272a" }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && <AddHabitModal onClose={() => setShowModal(false)} onSave={load} />}
    </div>
  );
}
