import Anthropic from "@anthropic-ai/sdk";
import { prisma, getOrCreateProfile } from "@/lib/db";
import { hashObject } from "@/lib/utils";
import { SYSTEM_PROMPT, buildScoringPrompt, buildWeeklyReviewPrompt } from "./prompts";
import { AIAnalysis } from "@/types";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STRIP_KEYS = new Set(["id", "createdAt", "updatedAt", "dailyLogId", "habitId", "projectId"]);

function stripDbFields(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !STRIP_KEYS.has(k)));
}

function serializeLog(log: Record<string, unknown>): Record<string, unknown> {
  return {
    date: (log.date as Date) ? format(log.date as Date, "yyyy-MM-dd") : log.date,
    sleep: stripDbFields(log.sleep as Record<string, unknown>),
    workout: stripDbFields(log.workout as Record<string, unknown>),
    stimulants: stripDbFields(log.stimulants as Record<string, unknown>),
    macros: stripDbFields(log.macros as Record<string, unknown>),
    supplements: Array.isArray(log.supplements)
      ? (log.supplements as Record<string, unknown>[]).map(stripDbFields)
      : null,
    healthMetrics: stripDbFields(log.healthMetrics as Record<string, unknown>),
  };
}

export async function generateDailyAnalysis(date: Date): Promise<AIAnalysis> {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const dateStr = format(date, "yyyy-MM-dd");

  const todayLog = await prisma.dailyLog.findFirst({
    where: { date: { gte: dayStart, lte: dayEnd } },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, healthMetrics: true, dailyScore: true,
    },
  });

  if (!todayLog) throw new Error(`No daily log found for ${dateStr}`);

  // Fetch finance, project, habit data for today
  const [expenses, incomes, projectLogs, habits] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: dayStart, lte: dayEnd } } }),
    prisma.income.findMany({ where: { date: { gte: dayStart, lte: dayEnd } } }),
    prisma.projectLog.findMany({
      where: { date: { gte: dayStart, lte: dayEnd } },
      include: { project: { select: { name: true, priority: true } } },
    }),
    prisma.habit.findMany({
      where: { active: true },
      include: {
        completions: { where: { date: { gte: dayStart, lte: dayEnd } } },
      },
    }),
  ]);

  // 30-day expense averages for finance scoring
  const cutoff30 = subDays(dayStart, 30);
  const expenses30 = await prisma.expense.findMany({
    where: { date: { gte: cutoff30, lt: dayStart } },
  });

  const todaySerialized: Record<string, unknown> = {
    ...serializeLog(todayLog as unknown as Record<string, unknown>),
    finances: {
      expenses: expenses.map((e) => ({ amount: e.amount, category: e.category, description: e.description })),
      income: incomes.map((i) => ({ amount: i.amount, source: i.source })),
      totalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      totalIncome: incomes.reduce((s, i) => s + i.amount, 0),
      net: incomes.reduce((s, i) => s + i.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0),
      avg30DayExpenseByCategory: Object.fromEntries(
        Array.from(new Set(expenses30.map((e) => e.category))).map((cat) => [
          cat,
          expenses30.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0) / 30,
        ])
      ),
    },
    projects: projectLogs.map((l) => ({
      project: l.project.name,
      priority: l.project.priority,
      hoursWorked: l.hoursWorked,
      whatWasCompleted: l.whatWasCompleted,
      blockers: l.blockers,
    })),
    habits: habits.map((h) => ({
      name: h.name,
      completed: h.completions.length > 0 && h.completions[0].completed,
    })),
  };

  const dataHash = hashObject(todaySerialized);

  if (
    todayLog.dailyScore?.dataHash === dataHash &&
    todayLog.dailyScore.overallScore > 0
  ) {
    const s = todayLog.dailyScore;
    return {
      scores: {
        sleep: s.sleepScore, workout: s.workoutScore, stimulants: s.stimulantsScore,
        macros: s.macrosScore, supplements: s.supplementsScore, finances: s.financesScore,
        health: s.healthScore, entrepreneurial: s.entrepreneurialScore, habits: s.habitScore,
      },
      overall: s.overallScore,
      recommendation: s.recommendation ?? "",
      priorityAction: s.priorityAction ?? "",
      warnings: s.warnings ? JSON.parse(s.warnings) : [],
      topTaskRecommendation: s.topTaskRecommendation ?? undefined,
    };
  }

  // Pending tasks (top 5 by priority)
  const pendingTasks = await prisma.task.findMany({
    where: { status: { in: ["Pending", "InProgress"] } },
    include: { project: { select: { name: true } } },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    take: 5,
  });

  const pendingTasksSerialized = pendingTasks.map((t) => ({
    title: t.title,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate ? format(t.dueDate, "yyyy-MM-dd") : null,
    project: t.project?.name ?? null,
    estimatedMinutes: t.estimatedMinutes,
    createdAt: format(t.createdAt, "yyyy-MM-dd"),
  }));

  // 14-day history logs
  const historyLogs = await prisma.dailyLog.findMany({
    where: { date: { gte: subDays(dayStart, 14), lt: dayStart } },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, healthMetrics: true, dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  const historySerialized = historyLogs.map((l) =>
    serializeLog(l as unknown as Record<string, unknown>)
  );

  const profile = await getOrCreateProfile();
  const profileData = {
    goals: {
      sleepHours: profile.targetSleepHours,
      bedtime: profile.targetBedtime,
      waketime: profile.targetWaketime,
      workoutsPerWeek: profile.targetWorkoutsPerWeek,
      protein_g: profile.targetProtein,
      carbs_g: profile.targetCarbs,
      fats_g: profile.targetFats,
      calories: profile.targetCalories,
      waterOz: profile.targetWater,
      dailySpendLimit: profile.targetDailySpend,
      monthlySavings: profile.targetMonthlySavings,
      projectHoursPerDay: profile.targetProjectHours,
      maxCaffeineMg: profile.maxCaffeineMg,
    },
    overallGoals: profile.overallGoals,
  };

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildScoringPrompt(
      profileData as Record<string, unknown>,
      todaySerialized,
      historySerialized,
      pendingTasksSerialized
    )}],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const analysis: AIAnalysis = JSON.parse(jsonStr);

  const scoreFields = {
    sleepScore: analysis.scores.sleep,
    workoutScore: analysis.scores.workout,
    stimulantsScore: analysis.scores.stimulants,
    macrosScore: analysis.scores.macros,
    supplementsScore: analysis.scores.supplements,
    financesScore: analysis.scores.finances,
    healthScore: analysis.scores.health,
    entrepreneurialScore: analysis.scores.entrepreneurial,
    habitScore: analysis.scores.habits,
    overallScore: analysis.overall,
    recommendation: analysis.recommendation,
    priorityAction: analysis.priorityAction,
    warnings: JSON.stringify(analysis.warnings),
    topTaskRecommendation: analysis.topTaskRecommendation ?? null,
    dataHash,
  };

  await prisma.dailyScore.upsert({
    where: { dailyLogId: todayLog.id },
    create: { dailyLogId: todayLog.id, ...scoreFields },
    update: scoreFields,
  });

  return analysis;
}

export async function generateWeeklyReview(weekEndDate: Date) {
  const weekStart = subDays(weekEndDate, 6);
  const logs = await prisma.dailyLog.findMany({
    where: { date: { gte: startOfDay(weekStart), lte: weekEndDate } },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, healthMetrics: true, dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  const profile = await getOrCreateProfile();
  const profileData = { goals: profile, overallGoals: profile.overallGoals };

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildWeeklyReviewPrompt(
      profileData as Record<string, unknown>,
      logs.map((l) => serializeLog(l as unknown as Record<string, unknown>))
    )}],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr);
}
