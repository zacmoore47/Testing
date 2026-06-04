import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/scoring";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const users = await prisma.user.findMany({
    select: { id: true, name: true, emoji: true, totalPoints: true },
    orderBy: { totalPoints: "desc" },
  });

  const activeSeason = await prisma.season.findFirst({
    where: { type: "WEEKLY", startDate: { lte: now }, endDate: { gt: now } },
    include: { seasonPoints: true },
  });

  const activeMonthly = await prisma.season.findFirst({
    where: { type: "MONTHLY", startDate: { lte: now }, endDate: { gt: now } },
    include: { seasonPoints: true },
  });

  const todayLogs = await prisma.logEntry.findMany({
    where: { date: today },
    select: { userId: true, pointsEarned: true },
  });

  const yesterdayLogs = await prisma.logEntry.findMany({
    where: { date: yesterday },
    select: { userId: true },
    distinct: ["userId"],
  });
  const loggedYesterday = new Set(yesterdayLogs.map((l) => l.userId));

  const todayPointsByUser = todayLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.userId] = (acc[l.userId] ?? 0) + l.pointsEarned;
    return acc;
  }, {});

  const usersData = users.map((u) => ({
    ...u,
    missedYesterday: !loggedYesterday.has(u.id),
    todayPoints: todayPointsByUser[u.id] ?? 0,
    weekPoints: activeSeason?.seasonPoints.find((sp) => sp.userId === u.id)?.points ?? 0,
    monthPoints: activeMonthly?.seasonPoints.find((sp) => sp.userId === u.id)?.points ?? 0,
  }));

  const currentUserId = (session.user as any).id as string;

  return (
    <DashboardClient
      users={usersData}
      currentUserId={currentUserId}
      weekSeason={
        activeSeason
          ? {
              startDate: activeSeason.startDate.toISOString(),
              endDate: activeSeason.endDate.toISOString(),
            }
          : null
      }
    />
  );
}
