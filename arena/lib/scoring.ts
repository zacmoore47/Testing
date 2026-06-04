import { Habit, Streak } from "@prisma/client";

const STREAK_BONUS_PER_DAY = 0.1; // +10% per consecutive day
const STREAK_BONUS_MAX = 0.5;     // capped at +50%

export function calculatePoints(habit: Habit, streak: Streak | null): number {
  const base = habit.points;
  const streakCount = streak?.current ?? 0;

  const multiplier = Math.min(1 + streakCount * STREAK_BONUS_PER_DAY, 1 + STREAK_BONUS_MAX);
  const raw = Math.round(base * multiplier);

  // Anti-farming cap
  const cap = habit.maxPoints ?? base * 2;
  return Math.min(raw, cap);
}

export function isStreakAlive(lastLogDate: Date | null): boolean {
  if (!lastLogDate) return false;
  const today = startOfDay(new Date());
  const last = startOfDay(lastLogDate);
  const diffMs = today.getTime() - last.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  // Streak alive if logged today or yesterday
  return diffDays <= 1;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
