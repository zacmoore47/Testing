import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/scoring";

// GET: current user's reminders, joined with today's logged status so the
// client scheduler can skip habits already completed today.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const today = startOfDay(new Date());
  const includeDisabled = req.nextUrl.searchParams.get("all") === "true";

  const reminders = await prisma.habitReminder.findMany({
    where: includeDisabled ? { userId } : { userId, enabled: true },
    include: { habit: { select: { id: true, title: true, isActive: true } } },
  });

  const todayLogs = await prisma.logEntry.findMany({
    where: { userId, date: today },
    select: { habitId: true },
  });
  const loggedToday = new Set(todayLogs.map((l) => l.habitId));

  return NextResponse.json({
    reminders: reminders
      .filter((r) => r.habit.isActive)
      .map((r) => ({
        habitId: r.habitId,
        habitTitle: r.habit.title,
        time: r.time,
        enabled: r.enabled,
        loggedToday: loggedToday.has(r.habitId),
      })),
  });
}

// POST: upsert a reminder for a habit (enable/disable + time)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id as string;
  const { habitId, enabled, time } = await req.json();

  if (!habitId || !time) {
    return NextResponse.json({ error: "habitId and time required" }, { status: 400 });
  }

  const reminder = await prisma.habitReminder.upsert({
    where: { userId_habitId: { userId, habitId } },
    update: { enabled, time },
    create: { userId, habitId, enabled, time },
  });

  return NextResponse.json({ reminder });
}
