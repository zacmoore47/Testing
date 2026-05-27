import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [logs, profile, expenses, incomes, projects, habits] = await Promise.all([
    prisma.dailyLog.findMany({
      include: { sleep: true, workout: true, stimulants: true, macros: true, supplements: true, healthMetrics: true, dailyScore: true },
      orderBy: { date: "asc" },
    }),
    prisma.userProfile.findFirst(),
    prisma.expense.findMany({ orderBy: { date: "asc" } }),
    prisma.income.findMany({ orderBy: { date: "asc" } }),
    prisma.project.findMany({ include: { logs: true } }),
    prisma.habit.findMany({ include: { completions: true } }),
  ]);

  return NextResponse.json({ exportedAt: new Date().toISOString(), profile, logs, expenses, incomes, projects, habits });
}
