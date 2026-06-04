import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/scoring";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const today = startOfDay(new Date());

  const habits = await prisma.habit.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

  const todayLogs = await prisma.logEntry.findMany({
    where: { userId, date: today },
    select: { habitId: true, pointsEarned: true },
  });

  const streaks = await prisma.streak.findMany({
    where: { userId },
  });

  const loggedToday = new Set(todayLogs.map((l) => l.habitId));
  const streakMap = new Map(streaks.map((s) => [s.habitId, s]));

  return NextResponse.json({
    habits: habits.map((h) => ({
      ...h,
      loggedToday: loggedToday.has(h.id),
      streak: streakMap.get(h.id) ?? null,
    })),
  });
}
