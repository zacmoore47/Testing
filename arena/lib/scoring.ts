import { Habit, Streak, PrismaClient } from "@prisma/client";

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

// Recomputes a user's streak for a habit from scratch based on remaining log history.
// Used after deleting a log entry (undo) so the streak reflects reality, not a guess.
export async function recalculateStreak(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  userId: string,
  habitId: string
) {
  const entries = await tx.logEntry.findMany({
    where: { userId, habitId },
    orderBy: { date: "asc" },
    select: { date: true },
  });

  let current = 0;
  let longest = 0;
  let lastLogDate: Date | null = null;
  let prevDate: Date | null = null;

  for (const entry of entries) {
    const day = startOfDay(entry.date);
    if (prevDate) {
      const diffDays = (day.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
      current = diffDays === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    longest = Math.max(longest, current);
    prevDate = day;
    lastLogDate = day;
  }

  await tx.streak.upsert({
    where: { userId_habitId: { userId, habitId } },
    update: { current, longest, lastLogDate },
    create: { userId, habitId, current, longest, lastLogDate },
  });
}
