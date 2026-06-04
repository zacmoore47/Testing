import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/scoring";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, emoji: true, totalPoints: true },
  });

  const activeSeason = await prisma.season.findFirst({
    where: { type: "WEEKLY", startDate: { lte: now }, endDate: { gt: now } },
    include: { seasonPoints: { include: { user: { select: { id: true, name: true, emoji: true } } } } },
  });

  const activeMonthly = await prisma.season.findFirst({
    where: { type: "MONTHLY", startDate: { lte: now }, endDate: { gt: now } },
    include: { seasonPoints: true },
  });

  // Check who logged yesterday (missed day detection)
  const yesterdayLogs = await prisma.logEntry.findMany({
    where: { date: yesterday },
    select: { userId: true },
    distinct: ["userId"],
  });
  const loggedYesterday = new Set(yesterdayLogs.map((l) => l.userId));

  // Today's logs per user
  const todayLogs = await prisma.logEntry.findMany({
    where: { date: today },
    select: { userId: true, pointsEarned: true },
  });

  const todayPointsByUser = todayLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.userId] = (acc[l.userId] ?? 0) + l.pointsEarned;
    return acc;
  }, {});

  // Active streaks at risk (daily habits with streak but not logged today)
  const streaksAtRisk = await prisma.streak.findMany({
    where: { current: { gt: 0 }, userId: { in: users.map((u) => u.id) } },
    include: { habit: { select: { title: true, frequency: true } } },
  });

  const usersData = users.map((u) => ({
    ...u,
    missedYesterday: !loggedYesterday.has(u.id),
    todayPoints: todayPointsByUser[u.id] ?? 0,
    weekPoints: activeSeason?.seasonPoints.find((sp) => sp.userId === u.id)?.points ?? 0,
    monthPoints: activeMonthly?.seasonPoints.find((sp) => sp.userId === u.id)?.points ?? 0,
    streaksAtRisk: streaksAtRisk
      .filter((s) => s.userId === u.id && s.habit.frequency === "DAILY")
      .map((s) => ({ habitTitle: s.habit.title, current: s.current })),
  }));

  return NextResponse.json({
    users: usersData,
    currentSeason: activeSeason ?? null,
    currentMonth: activeMonthly ?? null,
  });
}
