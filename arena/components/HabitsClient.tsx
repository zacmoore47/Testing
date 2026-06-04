"use client";
import { useState } from "react";

const CATEGORIES = ["HEALTH", "WEALTH", "LEARNING", "MIND"] as const;
const TYPES = ["BOOLEAN", "NUMERIC", "MILESTONE"] as const;
const FREQUENCIES = ["DAILY", "WEEKLY", "ONE_OFF"] as const;

const CAT_LABELS: Record<string, string> = {
  HEALTH: "💪 Health",
  WEALTH: "💰 Wealth",
  LEARNING: "📚 Learning",
  MIND: "🧘 Mind",
};

const TYPE_LABELS: Record<string, string> = {
  BOOLEAN: "Yes/No",
  NUMERIC: "Number",
  MILESTONE: "Milestone",
};

const FREQ_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  ONE_OFF: "One-off",
};

interface Habit {
  id: string;
  title: string;
  category: string;
  points: number;
  type: string;
  frequency: string;
  unit: string | null;
  minValue: number | null;
  maxPoints: number | null;
  description: string | null;
  isActive: boolean;
}

const BLANK: Omit<Habit, "id" | "isActive"> = {
  title: "",
  category: "HEALTH",
  points: 10,
  type: "BOOLEAN",
  frequency: "DAILY",
  unit: null,
  minValue: null,
  maxPoints: null,
  description: null,
};

export default function HabitsClient({ initialHabits }: { initialHabits: Habit[] }) {
  const [habits, setHabits] = useState(initialHabits);
  const [editing, setEditing] = useState<Habit | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const displayed = habits.filter((h) => showInactive || h.isActive);
  const grouped = CATEGORIES.reduce<Record<string, Habit[]>>((acc, cat) => {
    acc[cat] = displayed.filter((h) => h.category === cat);
    return acc;
  }, {});

  function openNew() {
    setIsNew(true);
    setEditing({ ...BLANK, id: "", isActive: true });
  }

  function openEdit(habit: Habit) {
    setIsNew(false);
    setEditing({ ...habit });
  }

  function closeModal() {
    setEditing(null);
    setIsNew(false);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch("/api/manage-habits", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }

      if (isNew) {
        setHabits((prev) => [...prev, data.habit]);
      } else {
        setHabits((prev) => prev.map((h) => h.id === data.habit.id ? data.habit : h));
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(habit: Habit) {
    const res = await fetch("/api/manage-habits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: habit.id, isActive: !habit.isActive }),
    });
    const data = await res.json();
    if (res.ok) {
      setHabits((prev) => prev.map((h) => h.id === data.habit.id ? data.habit : h));
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-2">
        <h2 className="text-xl font-black">Habits</h2>
        <button
          onClick={openNew}
          className="bg-yellow-400 text-black text-sm font-bold px-4 py-2 rounded-xl hover:bg-yellow-300 transition"
        >
          + Add Habit
        </button>
      </div>

      {/* Toggle inactive */}
      <button
        onClick={() => setShowInactive((v) => !v)}
        className="text-xs text-white/30 hover:text-white/50 transition"
      >
        {showInactive ? "Hide disabled habits" : "Show disabled habits"}
      </button>

      {/* Grouped habit list */}
      {CATEGORIES.map((cat) => {
        const catHabits = grouped[cat];
        if (!catHabits?.length) return null;
        return (
          <div key={cat}>
            <h3 className="text-xs font-bold text-white/40 tracking-widest mb-2 px-1">
              {CAT_LABELS[cat]}
            </h3>
            <div className="space-y-2">
              {catHabits.map((habit) => (
                <div
                  key={habit.id}
                  className={`flex items-center gap-3 p-4 rounded-xl border ${
                    habit.isActive
                      ? "bg-white/5 border-white/10"
                      : "bg-white/2 border-white/5 opacity-50"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{habit.title}</div>
                    <div className="text-xs text-white/30 mt-0.5">
                      {TYPE_LABELS[habit.type]} · {FREQ_LABELS[habit.frequency]}
                      {habit.unit && ` · ${habit.unit}`}
                    </div>
                  </div>
                  <div className="text-yellow-400 font-bold text-sm flex-shrink-0">
                    +{habit.points} pts
                  </div>
                  <button
                    onClick={() => openEdit(habit)}
                    className="text-white/30 hover:text-white/70 text-sm px-2 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(habit)}
                    className={`text-xs px-2 py-1 rounded-lg transition ${
                      habit.isActive
                        ? "text-red-400/60 hover:text-red-400 hover:bg-red-400/10"
                        : "text-green-400/60 hover:text-green-400 hover:bg-green-400/10"
                    }`}
                  >
                    {habit.isActive ? "Disable" : "Enable"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add / Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50 p-4">
          <div className="bg-[#1a1a1a] rounded-2xl p-6 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-lg">{isNew ? "New Habit" : "Edit Habit"}</h3>

            <Field label="Title">
              <input
                type="text"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                placeholder="e.g. Morning run"
                className={INPUT}
              />
            </Field>

            <Field label="Category">
              <select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className={INPUT}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CAT_LABELS[c]}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Points">
                <input
                  type="number"
                  value={editing.points}
                  onChange={(e) => setEditing({ ...editing, points: parseInt(e.target.value) || 0 })}
                  className={INPUT}
                  min={1}
                />
              </Field>
              <Field label="Point Cap">
                <input
                  type="number"
                  value={editing.maxPoints ?? editing.points}
                  onChange={(e) => setEditing({ ...editing, maxPoints: parseInt(e.target.value) || null })}
                  className={INPUT}
                  min={1}
                  placeholder="Same as points"
                />
              </Field>
            </div>

            <Field label="Type">
              <select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                className={INPUT}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </Field>

            <Field label="Frequency">
              <select
                value={editing.frequency}
                onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}
                className={INPUT}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>{FREQ_LABELS[f]}</option>
                ))}
              </select>
            </Field>

            {editing.type === "NUMERIC" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Unit (e.g. hours)">
                  <input
                    type="text"
                    value={editing.unit ?? ""}
                    onChange={(e) => setEditing({ ...editing, unit: e.target.value || null })}
                    className={INPUT}
                    placeholder="hours, steps..."
                  />
                </Field>
                <Field label="Min value">
                  <input
                    type="number"
                    value={editing.minValue ?? ""}
                    onChange={(e) => setEditing({ ...editing, minValue: parseFloat(e.target.value) || null })}
                    className={INPUT}
                    placeholder="0"
                  />
                </Field>
              </div>
            )}

            <Field label="Description (optional)">
              <input
                type="text"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value || null })}
                className={INPUT}
                placeholder="Optional note"
              />
            </Field>

            <div className="flex gap-3 pt-2">
              <button onClick={closeModal} className="flex-1 bg-white/10 rounded-xl py-3 text-sm font-bold">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !editing.title}
                className="flex-1 bg-yellow-400 text-black rounded-xl py-3 text-sm font-bold disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const INPUT = "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-400 transition text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-white/50 text-xs mb-1 block">{label}</label>
      {children}
    </div>
  );
}
