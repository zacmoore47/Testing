import { prisma } from "@/lib/db";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { SectorCard } from "@/components/dashboard/SectorCard";
import { FocusCard } from "@/components/dashboard/FocusCard";
import { StreakIndicator } from "@/components/dashboard/StreakIndicator";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectorCardData, SectorName, SparklineData } from "@/types";
import { format, subDays, startOfDay, differenceInDays } from "date-fns";
import Link from "next/link";
import { Plus } from "lucide-react";

async function getDashboardData() {
  const today = startOfDay(new Date());
  const cutoff = subDays(today, 30);

  const logs = await prisma.dailyLog.findMany({
    where: { date: { gte: cutoff } },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, finances: true, healthMetrics: true,
      entrepreneurial: true, dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  return { logs, today };
}

function buildSectorCards(logs: Awaited<ReturnType<typeof getDashboardData>>["logs"]): SectorCardData[] {
  const todayLog = logs.find(
    (l) => format(l.date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
  );

  function sparkline(getter: (l: typeof logs[0]) => number | null | undefined): SparklineData[] {
    return logs.slice(-7).map((l) => ({
      date: format(l.date, "yyyy-MM-dd"),
      value: getter(l) ?? 0,
    }));
  }

  const sectors: SectorCardData[] = [
    {
      name: "sleep" as SectorName,
      label: "Sleep",
      score: todayLog?.dailyScore?.sleepScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.sleepScore),
      topMetric: "Hours",
      topMetricValue: todayLog?.sleep ? `${todayLog.sleep.hours}h` : "—",
    },
    {
      name: "workout" as SectorName,
      label: "Workout",
      score: todayLog?.dailyScore?.workoutScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.workoutScore),
      topMetric: "Duration",
      topMetricValue: todayLog?.workout ? `${todayLog.workout.duration}min` : "—",
    },
    {
      name: "stimulants" as SectorName,
      label: "Stimulants",
      score: todayLog?.dailyScore?.stimulantsScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.stimulantsScore),
      topMetric: "Caffeine",
      topMetricValue: todayLog?.stimulants ? `${todayLog.stimulants.caffeineMg}mg` : "—",
    },
    {
      name: "macros" as SectorName,
      label: "Nutrition",
      score: todayLog?.dailyScore?.macrosScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.macrosScore),
      topMetric: "Protein",
      topMetricValue: todayLog?.macros ? `${todayLog.macros.protein}g` : "—",
    },
    {
      name: "supplements" as SectorName,
      label: "Supplements",
      score: todayLog?.dailyScore?.supplementsScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.supplementsScore),
      topMetric: "Taken",
      topMetricValue: todayLog?.supplements
        ? `${todayLog.supplements.filter((s) => s.taken).length}/${todayLog.supplements.length}`
        : "—",
    },
    {
      name: "finances" as SectorName,
      label: "Finances",
      score: todayLog?.dailyScore?.financesScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.financesScore),
      topMetric: "Net today",
      topMetricValue: todayLog?.finances ? `$${todayLog.finances.netForDay.toFixed(0)}` : "—",
    },
    {
      name: "health" as SectorName,
      label: "Health",
      score: todayLog?.dailyScore?.healthScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.healthScore),
      topMetric: "Energy",
      topMetricValue: todayLog?.healthMetrics?.energy ? `${todayLog.healthMetrics.energy}/10` : "—",
    },
    {
      name: "entrepreneurial" as SectorName,
      label: "Entrepreneur",
      score: todayLog?.dailyScore?.entrepreneurialScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.entrepreneurialScore),
      topMetric: "Deep work",
      topMetricValue: todayLog?.entrepreneurial ? `${todayLog.entrepreneurial.deepWorkHours}h` : "—",
    },
  ];

  return sectors;
}

function calcStreaks(logs: Awaited<ReturnType<typeof getDashboardData>>["logs"]) {
  // Sleep streak: logged sleep every day
  let sleepStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i];
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(l.date));
    if (diff > sleepStreak + 1) break;
    if (l.sleep) sleepStreak++;
    else break;
  }

  // Workout streak
  let workoutStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i];
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(l.date));
    if (diff > workoutStreak + 1) break;
    if (l.workout && l.workout.type !== "rest") workoutStreak++;
    else break;
  }

  // Logging streak
  let logStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const l = logs[i];
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(l.date));
    if (diff > logStreak + 1) break;
    logStreak++;
  }

  return { sleepStreak, workoutStreak, logStreak };
}

export default async function DashboardPage() {
  const { logs } = await getDashboardData();
  const todayLog = logs.find(
    (l) => format(l.date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd")
  );
  const overallScore = todayLog?.dailyScore?.overallScore ?? 0;
  const sectorCards = buildSectorCards(logs);
  const streaks = calcStreaks(logs);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const hasDataToday = !!todayLog;

  const warnings = todayLog?.dailyScore?.warnings
    ? JSON.parse(todayLog.dailyScore.warnings)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good {getTimeOfDay()}, chief.</h1>
          <p className="text-zinc-400 text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Link href="/log">
          <Button variant="primary" className="gap-2">
            <Plus className="h-4 w-4" />
            {hasDataToday ? "Update today" : "Log today"}
          </Button>
        </Link>
      </div>

      {/* Hero: Score + Focus card */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
        {/* Score ring */}
        <Card className="flex flex-col items-center p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">
            Today&apos;s Score
          </div>
          <ScoreRing score={overallScore} size={180} />
          {!hasDataToday && (
            <p className="mt-4 text-xs text-zinc-500 text-center max-w-[160px]">
              No data yet — log your day to see your score
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <FocusCard
            recommendation={todayLog?.dailyScore?.recommendation ?? ""}
            priorityAction={todayLog?.dailyScore?.priorityAction ?? ""}
            warnings={warnings}
            date={todayStr}
          />
          {/* Streaks */}
          <div className="grid grid-cols-3 gap-3">
            <StreakIndicator label="Sleep streak" streak={streaks.sleepStreak} />
            <StreakIndicator label="Workout streak" streak={streaks.workoutStreak} />
            <StreakIndicator label="Logging streak" streak={streaks.logStreak} />
          </div>
        </div>
      </div>

      {/* Sector grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
          Sector Scores
        </h2>
        {hasDataToday ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {sectorCards.map((card) => (
              <SectorCard key={card.name} data={card} />
            ))}
          </div>
        ) : (
          <Card className="py-12 text-center">
            <CardContent>
              <p className="text-zinc-500 mb-4">No data logged today.</p>
              <Link href="/log">
                <Button variant="primary">Log your first entry</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
