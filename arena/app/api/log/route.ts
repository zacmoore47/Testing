import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculatePoints, isStreakAlive, startOfDay } from "@/lib/scoring";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const { habitId, value, note, proofUrl } = await req.json();

  if (!habitId) return NextResponse.json({ error: "habitId required" }, { status: 400 });

  const habit = await prisma.habit.findUnique({ where: { id: habitId } });
  if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });

  const today = startOfDay(new Date());

  // Check if already logged today
  const existing = await prisma.logEntry.findUnique({
    where: { userId_habitId_date: { userId, habitId, date: today } },
  });
  if (existing) return NextResponse.json({ error: "Already logged today" }, { status: 409 });

  // Get or create streak
  let streak = await prisma.streak.findUnique({ where: { userId_habitId: { userId, habitId } } });

  const alive = isStreakAlive(streak?.lastLogDate ?? null);
  const newCurrent = alive ? (streak?.current ?? 0) + 1 : 1;
  const newLongest = Math.max(newCurrent, streak?.longest ?? 0);

  // Calculate points with streak multiplier
  const mockStreak = { current: newCurrent - 1 } as any; // use streak BEFORE increment for this log
  const pointsEarned = calculatePoints(habit, mockStreak);

  // Create log entry + feed item in transaction
  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.logEntry.create({
      data: { userId, habitId, date: today, value, note, proofUrl, pointsEarned },
    });

    await tx.feedItem.create({ data: { logEntryId: entry.id, userId } });

    // Update streak
    streak = await tx.streak.upsert({
      where: { userId_habitId: { userId, habitId } },
      update: { current: newCurrent, longest: newLongest, lastLogDate: today },
      create: { userId, habitId, current: newCurrent, longest: newLongest, lastLogDate: today },
    });

    // Update user total points
    await tx.user.update({
      where: { id: userId },
      data: { totalPoints: { increment: pointsEarned } },
    });

    // Update active season points
    const now = new Date();
    const activeSeasons = await tx.season.findMany({
      where: { startDate: { lte: now }, endDate: { gt: now } },
    });
    for (const season of activeSeasons) {
      await tx.seasonPoints.upsert({
        where: { seasonId_userId: { seasonId: season.id, userId } },
        update: { points: { increment: pointsEarned } },
        create: { seasonId: season.id, userId, points: pointsEarned },
      });
    }

    return { entry, streak };
  });

  return NextResponse.json({ pointsEarned, streak: result.streak });
}
