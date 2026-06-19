import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/scoring";
import LogClient from "@/components/LogClient";
import { HabitCategory } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;
  const today = startOfDay(new Date());

  const habits = await prisma.habit.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

  const todayLogs = await prisma.logEntry.findMany({
    where: { userId, date: today },
    select: { id: true, habitId: true, pointsEarned: true },
  });

  const streaks = await prisma.streak.findMany({ where: { userId } });

  const loggedTodayMap = new Map(todayLogs.map((l) => [l.habitId, l.id]));
  const pointsEarnedMap = new Map(todayLogs.map((l) => [l.habitId, l.pointsEarned]));
  const streakMap = new Map(streaks.map((s) => [s.habitId, s.current]));

  const habitsData = habits.map((h) => ({
    id: h.id,
    title: h.title,
    category: h.category as string,
    points: h.points,
    type: h.type as string,
    frequency: h.frequency as string,
    unit: h.unit,
    minValue: h.minValue,
    loggedToday: loggedTodayMap.has(h.id),
    logEntryId: loggedTodayMap.get(h.id) ?? null,
    pointsEarnedToday: pointsEarnedMap.get(h.id) ?? 0,
    streak: streakMap.get(h.id) ?? 0,
  }));

  const todayTotal = todayLogs.reduce((sum, l) => sum + l.pointsEarned, 0);

  return <LogClient habits={habitsData} todayTotal={todayTotal} />;
}
