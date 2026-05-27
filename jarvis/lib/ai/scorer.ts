import Anthropic from "@anthropic-ai/sdk";
import { prisma, getOrCreateProfile } from "@/lib/db";
import { hashObject } from "@/lib/utils";
import { SYSTEM_PROMPT, buildScoringPrompt, buildWeeklyReviewPrompt } from "./prompts";
import { AIAnalysis } from "@/types";
import { format, subDays, startOfDay } from "date-fns";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const STRIP_KEYS = new Set(["id", "createdAt", "updatedAt", "dailyLogId"]);

function stripDbFields(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return null;
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !STRIP_KEYS.has(k)));
}

function serializeLog(log: Record<string, unknown>) {
  const stripped = stripDbFields(log) ?? {};
  const date = (log.date as Date) ? format(log.date as Date, "yyyy-MM-dd") : log.date;

  return {
    date,
    sleep: stripDbFields(log.sleep as Record<string, unknown>),
    workout: stripDbFields(log.workout as Record<string, unknown>),
    stimulants: stripDbFields(log.stimulants as Record<string, unknown>),
    macros: stripDbFields(log.macros as Record<string, unknown>),
    supplements: Array.isArray(log.supplements)
      ? (log.supplements as Record<string, unknown>[]).map(stripDbFields)
      : null,
    finances: stripDbFields(log.finances as Record<string, unknown>),
    healthMetrics: stripDbFields(log.healthMetrics as Record<string, unknown>),
    entrepreneurial: stripDbFields(log.entrepreneurial as Record<string, unknown>),
    ...Object.fromEntries(
      Object.entries(stripped).filter(([k]) =>
        !["sleep","workout","stimulants","macros","supplements","finances","healthMetrics","entrepreneurial","date","dailyScore"].includes(k)
      )
    ),
  };
}

export async function generateDailyAnalysis(date: Date): Promise<AIAnalysis> {
  const startOfTargetDay = startOfDay(date);

  // Find or create the log record for this date
  const todayLog = await prisma.dailyLog.findFirst({
    where: {
      date: {
        gte: startOfTargetDay,
        lte: new Date(startOfTargetDay.getTime() + 86400000 - 1),
      },
    },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, finances: true, healthMetrics: true,
      entrepreneurial: true, dailyScore: true,
    },
  });

  if (!todayLog) {
    throw new Error(`No daily log found for ${format(date, "yyyy-MM-dd")}`);
  }

  const profile = await getOrCreateProfile();
  const todaySerialized = serializeLog(todayLog as unknown as Record<string, unknown>);
  const dataHash = hashObject(todaySerialized);

  // Return cached result if data hasn't changed
  if (
    todayLog.dailyScore &&
    todayLog.dailyScore.dataHash === dataHash &&
    todayLog.dailyScore.overallScore > 0
  ) {
    const s = todayLog.dailyScore;
    return {
      scores: {
        sleep: s.sleepScore,
        workout: s.workoutScore,
        stimulants: s.stimulantsScore,
        macros: s.macrosScore,
        supplements: s.supplementsScore,
        finances: s.financesScore,
        health: s.healthScore,
        entrepreneurial: s.entrepreneurialScore,
      },
      overall: s.overallScore,
      recommendation: s.recommendation ?? "",
      priorityAction: s.priorityAction ?? "",
      warnings: s.warnings ? JSON.parse(s.warnings) : [],
    };
  }

  // Fetch 14-day history (excluding today)
  const historyLogs = await prisma.dailyLog.findMany({
    where: {
      date: {
        gte: subDays(startOfTargetDay, 14),
        lt: startOfTargetDay,
      },
    },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, finances: true, healthMetrics: true,
      entrepreneurial: true, dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  const historySerialized = historyLogs.map((l) =>
    serializeLog(l as unknown as Record<string, unknown>)
  );

  const profileData = {
    goals: {
      sleepHours: profile.targetSleepHours,
      bedtime: profile.targetBedtime,
      waketime: profile.targetWaketime,
      workoutsPerWeek: profile.targetWorkoutsPerWeek,
      caloriesBurned: profile.targetCaloriesBurned,
      protein_g: profile.targetProtein,
      carbs_g: profile.targetCarbs,
      fats_g: profile.targetFats,
      calories: profile.targetCalories,
      waterOz: profile.targetWater,
      dailyIncome: profile.targetDailyIncome,
      monthlySavings: profile.targetMonthlySavings,
      weight: profile.targetWeight,
      deepWorkHours: profile.targetDeepWorkHours,
      revenueHoursPerDay: profile.targetRevenueHoursPerDay,
      maxCaffeineMg: profile.maxCaffeineMg,
    },
    overallGoals: profile.overallGoals,
  };

  const userMessage = buildScoringPrompt(
    profileData as Record<string, unknown>,
    todaySerialized as Record<string, unknown>,
    historySerialized as Record<string, unknown>[]
  );

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  // Strip any markdown code fences
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const analysis: AIAnalysis = JSON.parse(jsonStr);

  // Persist to DB (upsert)
  await prisma.dailyScore.upsert({
    where: { dailyLogId: todayLog.id },
    create: {
      dailyLogId: todayLog.id,
      sleepScore: analysis.scores.sleep,
      workoutScore: analysis.scores.workout,
      stimulantsScore: analysis.scores.stimulants,
      macrosScore: analysis.scores.macros,
      supplementsScore: analysis.scores.supplements,
      financesScore: analysis.scores.finances,
      healthScore: analysis.scores.health,
      entrepreneurialScore: analysis.scores.entrepreneurial,
      overallScore: analysis.overall,
      recommendation: analysis.recommendation,
      priorityAction: analysis.priorityAction,
      warnings: JSON.stringify(analysis.warnings),
      dataHash,
    },
    update: {
      sleepScore: analysis.scores.sleep,
      workoutScore: analysis.scores.workout,
      stimulantsScore: analysis.scores.stimulants,
      macrosScore: analysis.scores.macros,
      supplementsScore: analysis.scores.supplements,
      financesScore: analysis.scores.finances,
      healthScore: analysis.scores.health,
      entrepreneurialScore: analysis.scores.entrepreneurial,
      overallScore: analysis.overall,
      recommendation: analysis.recommendation,
      priorityAction: analysis.priorityAction,
      warnings: JSON.stringify(analysis.warnings),
      dataHash,
    },
  });

  return analysis;
}

export async function generateWeeklyReview(weekEndDate: Date) {
  const weekStart = subDays(weekEndDate, 6);

  const logs = await prisma.dailyLog.findMany({
    where: {
      date: { gte: startOfDay(weekStart), lte: weekEndDate },
    },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, finances: true, healthMetrics: true,
      entrepreneurial: true, dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  const profile = await getOrCreateProfile();
  const profileData = { goals: profile, overallGoals: profile.overallGoals };

  const userMessage = buildWeeklyReviewPrompt(
    profileData as Record<string, unknown>,
    logs.map((l) => serializeLog(l as unknown as Record<string, unknown>)) as Record<string, unknown>[]
  );

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr);
}
