import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay, subDays } from "date-fns";

const schema = z.object({ habitName: z.string().min(1) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    const habit = await prisma.habit.findFirst({
      where: { name: { contains: data.habitName }, active: true },
    });
    if (!habit) return NextResponse.json({ success: false, error: `No habit matching "${data.habitName}" found.` }, { status: 404 });

    const today = startOfDay(new Date());
    await prisma.habitCompletion.upsert({
      where: { habitId_date: { habitId: habit.id, date: today } },
      create: { habitId: habit.id, date: today, completed: true },
      update: { completed: true },
    });

    // Calculate streak
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = startOfDay(subDays(new Date(), i));
      const completion = await prisma.habitCompletion.findFirst({ where: { habitId: habit.id, date: d, completed: true } });
      if (completion) streak++; else break;
    }

    const msg = `${habit.name} marked complete. ${streak}-day streak, Sir.`;
    await logApiCall("/api/shortcuts/habit-complete", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to mark habit";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/habit-complete", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
