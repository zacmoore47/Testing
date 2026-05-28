import { prisma } from "@/lib/db";
import { ScoreRing } from "@/components/dashboard/ScoreRing";
import { SectorCard } from "@/components/dashboard/SectorCard";
import { FocusCard } from "@/components/dashboard/FocusCard";
import { StreakIndicator } from "@/components/dashboard/StreakIndicator";
import { HabitTracker } from "@/components/dashboard/HabitTracker";
import { PriorityTasksWidget } from "@/components/tasks/PriorityTasksWidget";
import { FocusModeCard } from "@/components/dashboard/FocusModeCard";
import { JarvisGreeting } from "@/components/JarvisGreeting";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectorCardData, SectorName, SparklineData, TaskRow } from "@/types";
import { format, subDays, startOfDay, endOfDay, differenceInDays } from "date-fns";
import Link from "next/link";
import { Plus } from "lucide-react";

async function getDashboardData() {
  const today = startOfDay(new Date());
  const cutoff = subDays(today, 30);

  const [logs, todayExpenses, todayIncome, todayProjectLogs, pendingTasks] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { date: { gte: cutoff } },
      include: {
        sleep: true, workout: true, stimulants: true, macros: true,
        supplements: true, healthMetrics: true, dailyScore: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.expense.findMany({ where: { date: { gte: today, lte: endOfDay(new Date()) } } }),
    prisma.income.findMany({ where: { date: { gte: today, lte: endOfDay(new Date()) } } }),
    prisma.projectLog.findMany({
      where: { date: { gte: today, lte: endOfDay(new Date()) } },
      include: { project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.findMany({
      where: { status: { in: ["Pending", "InProgress"] } },
      include: { project: { select: { name: true } } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
      take: 5,
    }),
  ]);

  return { logs, todayExpenses, todayIncome, todayProjectLogs, pendingTasks };
}

function buildSectorCards(
  logs: Awaited<ReturnType<typeof getDashboardData>>["logs"],
  todayExpenses: Awaited<ReturnType<typeof getDashboardData>>["todayExpenses"],
  todayIncome: Awaited<ReturnType<typeof getDashboardData>>["todayIncome"],
  todayProjectLogs: Awaited<ReturnType<typeof getDashboardData>>["todayProjectLogs"],
): SectorCardData[] {
  const todayLog = logs.find((l) => format(l.date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"));

  function sparkline(getter: (l: typeof logs[0]) => number | null | undefined): SparklineData[] {
    return logs.slice(-7).map((l) => ({ date: format(l.date, "yyyy-MM-dd"), value: getter(l) ?? 0 }));
  }

  const totalExpenses = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const totalIncome = todayIncome.reduce((s, i) => s + i.amount, 0);
  const totalProjectHours = todayProjectLogs.reduce((s, l) => s + l.hoursWorked, 0);

  return [
    {
      name: "sleep" as SectorName, label: "Sleep", score: todayLog?.dailyScore?.sleepScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.sleepScore),
      topMetric: "Hours", topMetricValue: todayLog?.sleep ? `${todayLog.sleep.hours}h` : "—",
    },
    {
      name: "workout" as SectorName, label: "Workout", score: todayLog?.dailyScore?.workoutScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.workoutScore),
      topMetric: "Duration", topMetricValue: todayLog?.workout ? `${todayLog.workout.duration}min` : "—",
    },
    {
      name: "stimulants" as SectorName, label: "Stimulants", score: todayLog?.dailyScore?.stimulantsScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.stimulantsScore),
      topMetric: "Caffeine", topMetricValue: todayLog?.stimulants ? `${todayLog.stimulants.caffeineMg}mg` : "—",
    },
    {
      name: "macros" as SectorName, label: "Nutrition", score: todayLog?.dailyScore?.macrosScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.macrosScore),
      topMetric: "Protein", topMetricValue: todayLog?.macros ? `${todayLog.macros.protein}g` : "—",
    },
    {
      name: "supplements" as SectorName, label: "Supplements", score: todayLog?.dailyScore?.supplementsScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.supplementsScore),
      topMetric: "Taken",
      topMetricValue: todayLog?.supplements ? `${todayLog.supplements.filter((s) => s.taken).length}/${todayLog.supplements.length}` : "—",
    },
    {
      name: "finances" as SectorName, label: "Finances", score: todayLog?.dailyScore?.financesScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.financesScore),
      topMetric: "Net today",
      topMetricValue: totalExpenses + totalIncome > 0 ? `$${(totalIncome - totalExpenses).toFixed(0)}` : "—",
    },
    {
      name: "health" as SectorName, label: "Health", score: todayLog?.dailyScore?.healthScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.healthScore),
      topMetric: "Energy",
      topMetricValue: todayLog?.healthMetrics?.energy ? `${todayLog.healthMetrics.energy}/10` : "—",
    },
    {
      name: "entrepreneurial" as SectorName, label: "Projects", score: todayLog?.dailyScore?.entrepreneurialScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.entrepreneurialScore),
      topMetric: "Hours today",
      topMetricValue: totalProjectHours > 0 ? `${totalProjectHours}h` : "—",
    },
    {
      name: "habits" as SectorName, label: "Habits", score: todayLog?.dailyScore?.habitScore ?? 0,
      sparkline: sparkline((l) => l.dailyScore?.habitScore),
      topMetric: "Score", topMetricValue: todayLog?.dailyScore?.habitScore ? `${Math.round(todayLog.dailyScore.habitScore)}%` : "—",
    },
  ];
}

function calcStreaks(logs: Awaited<ReturnType<typeof getDashboardData>>["logs"]) {
  let sleepStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(logs[i].date));
    if (diff > sleepStreak + 1) break;
    if (logs[i].sleep) sleepStreak++;
    else break;
  }
  let workoutStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(logs[i].date));
    if (diff > workoutStreak + 1) break;
    if (logs[i].workout && logs[i].workout!.type !== "rest") workoutStreak++;
    else break;
  }
  let logStreak = 0;
  for (let i = logs.length - 1; i >= 0; i--) {
    const diff = differenceInDays(startOfDay(new Date()), startOfDay(logs[i].date));
    if (diff > logStreak + 1) break;
    logStreak++;
  }
  return { sleepStreak, workoutStreak, logStreak };
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export default async function DashboardPage() {
  const { logs, todayExpenses, todayIncome, todayProjectLogs, pendingTasks } = await getDashboardData();
  const todayLog = logs.find((l) => format(l.date, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd"));
  const overallScore = todayLog?.dailyScore?.overallScore ?? 0;
  const sectorCards = buildSectorCards(logs, todayExpenses, todayIncome, todayProjectLogs);
  const streaks = calcStreaks(logs);
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const hasDataToday = !!todayLog;
  const warnings = todayLog?.dailyScore?.warnings ? JSON.parse(todayLog.dailyScore.warnings) : [];

  const topTaskTitle = pendingTasks[0]?.title ?? null;

  const serializedPendingTasks: TaskRow[] = pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status as TaskRow["status"],
    dueDate: t.dueDate?.toISOString() ?? null,
    projectId: t.projectId,
    projectName: t.project?.name ?? null,
    estimatedMinutes: t.estimatedMinutes,
    completedAt: t.completedAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    order: t.order,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good {getTimeOfDay()}, Sir.</h1>
          <p className="text-zinc-400 text-sm">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <JarvisGreeting topTaskTitle={topTaskTitle} />
          <Link href="/projects">
            <Button variant="outline" className="gap-2 hidden sm:flex">🚀 Projects</Button>
          </Link>
          <Link href="/log">
            <Button variant="primary" className="gap-2">
              <Plus className="h-4 w-4" />
              {hasDataToday ? "Update today" : "Log today"}
            </Button>
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
        <Card className="flex flex-col items-center p-6">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4">Today&apos;s Score</div>
          <ScoreRing score={overallScore} size={180} />
          {!hasDataToday && (
            <p className="mt-4 text-xs text-zinc-500 text-center max-w-[160px]">No data yet — log your day to see your score</p>
          )}
        </Card>
        <div className="space-y-4">
          <FocusCard
            recommendation={todayLog?.dailyScore?.recommendation ?? ""}
            priorityAction={todayLog?.dailyScore?.priorityAction ?? ""}
            warnings={warnings}
            date={todayStr}
          />
          <div className="grid grid-cols-3 gap-3">
            <StreakIndicator label="Sleep streak" streak={streaks.sleepStreak} />
            <StreakIndicator label="Workout streak" streak={streaks.workoutStreak} />
            <StreakIndicator label="Logging streak" streak={streaks.logStreak} />
          </div>
        </div>
      </div>

      {/* Sector grid (9 cards) */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">Sector Scores</h2>
        {hasDataToday ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {sectorCards.map((card) => <SectorCard key={card.name} data={card} />)}
          </div>
        ) : (
          <Card className="py-12 text-center">
            <CardContent>
              <p className="text-zinc-500 mb-4">No data logged today.</p>
              <Link href="/log"><Button variant="primary">Log your first entry</Button></Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Focus */}
      <FocusModeCard />

      {/* Priority Tasks */}
      <PriorityTasksWidget initialTasks={serializedPendingTasks} />

      {/* Habit tracker */}
      <HabitTracker />
    </div>
  );
}
