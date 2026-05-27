import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { startOfDay, endOfDay, startOfMonth, startOfWeek } from "date-fns";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma() {
  const dbPath = path.resolve(process.cwd(), "prisma/dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// ─── Profile ──────────────────────────────────────────────────────────────

export async function getOrCreateProfile() {
  return prisma.userProfile.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

// ─── Daily Log ────────────────────────────────────────────────────────────

export async function getDailyLog(date: Date) {
  const d = startOfDay(date);
  return prisma.dailyLog.findFirst({
    where: { date: { gte: d, lte: endOfDay(date) } },
    include: {
      sleep: true,
      workout: true,
      stimulants: true,
      macros: true,
      supplements: true,
      healthMetrics: true,
      dailyScore: true,
    },
  });
}

export async function getRecentLogs(days = 14) {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - days);
  return prisma.dailyLog.findMany({
    where: { date: { gte: cutoff } },
    include: {
      sleep: true,
      workout: true,
      stimulants: true,
      macros: true,
      supplements: true,
      healthMetrics: true,
      dailyScore: true,
    },
    orderBy: { date: "asc" },
  });
}

// ─── Finance helpers ──────────────────────────────────────────────────────

export async function getExpensesForDate(date: Date) {
  return prisma.expense.findMany({
    where: { date: { gte: startOfDay(date), lte: endOfDay(date) } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getIncomeForDate(date: Date) {
  return prisma.income.findMany({
    where: { date: { gte: startOfDay(date), lte: endOfDay(date) } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMonthlyFinanceSummary(date: Date) {
  const monthStart = startOfMonth(date);
  const [expenses, income] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: monthStart, lte: endOfDay(date) } } }),
    prisma.income.findMany({ where: { date: { gte: monthStart, lte: endOfDay(date) } } }),
  ]);
  return { expenses, income };
}

// ─── Project helpers ──────────────────────────────────────────────────────

export async function getActiveProjects() {
  return prisma.project.findMany({
    where: { status: "Active" },
    include: { logs: { orderBy: { date: "desc" }, take: 1 } },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function getProjectLogsForDate(date: Date) {
  return prisma.projectLog.findMany({
    where: { date: { gte: startOfDay(date), lte: endOfDay(date) } },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWeeklyProjectHours(date: Date) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  return prisma.projectLog.groupBy({
    by: ["projectId"],
    where: { date: { gte: weekStart, lte: endOfDay(date) } },
    _sum: { hoursWorked: true },
  });
}

// ─── Habit helpers ────────────────────────────────────────────────────────

export async function getHabitsWithRecentCompletions(days = 60) {
  const cutoff = startOfDay(new Date());
  cutoff.setDate(cutoff.getDate() - days);
  return prisma.habit.findMany({
    where: { active: true },
    include: {
      completions: {
        where: { date: { gte: cutoff } },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });
}

export async function getTodayHabitCompletions(date: Date) {
  return prisma.habitCompletion.findMany({
    where: {
      date: { gte: startOfDay(date), lte: endOfDay(date) },
    },
    include: { habit: true },
  });
}
