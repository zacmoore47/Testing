import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  try {
    await requireApiToken(req);

    const today = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    const [todayLog, expenses, income, topTask, habits, focusSessions] = await Promise.all([
      prisma.dailyLog.findFirst({
        where: { date: { gte: today, lte: todayEnd } },
        include: { dailyScore: true },
      }),
      prisma.expense.findMany({ where: { date: { gte: today, lte: todayEnd } } }),
      prisma.income.findMany({ where: { date: { gte: today, lte: todayEnd } } }),
      prisma.task.findFirst({
        where: { status: { in: ["Pending", "InProgress"] } },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      }),
      prisma.habit.findMany({
        where: { active: true },
        include: { completions: { where: { date: { gte: today, lte: todayEnd } } } },
      }),
      prisma.focusSession.findMany({
        where: { startedAt: { gte: today }, sessionType: "Work", completed: true },
      }),
    ]);

    const score = todayLog?.dailyScore?.overallScore ?? 0;
    const net = income.reduce((s, i) => s + i.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0);
    const focusMinutes = focusSessions.reduce((s, f) => s + (f.actualMinutes ?? 0), 0);
    const incompleteHabit = habits.find((h) => !h.completions.some((c) => c.completed));

    const h = new Date().getHours();
    const tod = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";

    const parts = [
      `Good ${tod}, Sir.`,
      score > 0 ? `Today's score is ${Math.round(score)}.` : "No score logged yet.",
      topTask ? `Top task: ${topTask.title}.` : "No pending tasks.",
      focusMinutes > 0 ? `${focusMinutes} focus minutes logged.` : null,
      `Net today: ${net >= 0 ? "+" : ""}£${net.toFixed(0)}.`,
      incompleteHabit ? `Still to complete: ${incompleteHabit.name}.` : "All habits done.",
    ].filter(Boolean).join(" ");

    await logApiCall("/api/shortcuts/status", "GET", null, 200, true);
    return NextResponse.json({ success: true, message: parts });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : "Failed to get status";
    const status = e instanceof ApiAuthError ? e.status : 500;
    await logApiCall("/api/shortcuts/status", "GET", null, status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
