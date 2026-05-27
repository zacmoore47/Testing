import { prisma } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/TrendChart";
import { Badge } from "@/components/ui/badge";
import { scoreColor } from "@/lib/utils";
import { format, subDays, startOfDay } from "date-fns";
import { notFound } from "next/navigation";
import { SectorName } from "@/types";

const SECTOR_CONFIG: Record<SectorName, { label: string; icon: string; color: string }> = {
  sleep: { label: "Sleep", icon: "😴", color: "#818cf8" },
  workout: { label: "Workout", icon: "💪", color: "#34d399" },
  stimulants: { label: "Stimulants", icon: "☕", color: "#fb923c" },
  macros: { label: "Nutrition", icon: "🥗", color: "#4ade80" },
  supplements: { label: "Supplements", icon: "💊", color: "#a78bfa" },
  finances: { label: "Finances", icon: "💰", color: "#fbbf24" },
  health: { label: "Health", icon: "❤️", color: "#f87171" },
  entrepreneurial: { label: "Entrepreneur", icon: "🚀", color: "#60a5fa" },
};

const VALID_SECTORS = Object.keys(SECTOR_CONFIG) as SectorName[];

async function getSectorData(name: SectorName) {
  const cutoff = subDays(startOfDay(new Date()), 90);

  const logs = await prisma.dailyLog.findMany({
    where: { date: { gte: cutoff } },
    include: {
      sleep: name === "sleep",
      workout: name === "workout",
      stimulants: name === "stimulants",
      macros: name === "macros",
      supplements: name === "supplements",
      finances: name === "finances",
      healthMetrics: name === "health",
      entrepreneurial: name === "entrepreneurial",
      dailyScore: true,
    },
    orderBy: { date: "asc" },
  });

  return logs;
}

function getScoreKey(name: SectorName): keyof NonNullable<Awaited<ReturnType<typeof getSectorData>>[0]["dailyScore"]> {
  const map: Record<SectorName, string> = {
    sleep: "sleepScore",
    workout: "workoutScore",
    stimulants: "stimulantsScore",
    macros: "macrosScore",
    supplements: "supplementsScore",
    finances: "financesScore",
    health: "healthScore",
    entrepreneurial: "entrepreneurialScore",
  };
  return map[name] as keyof NonNullable<Awaited<ReturnType<typeof getSectorData>>[0]["dailyScore"]>;
}

function renderSectorMetrics(name: SectorName, log: Awaited<ReturnType<typeof getSectorData>>[0]) {
  switch (name) {
    case "sleep":
      if (!log.sleep) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <MetricCell label="Hours" value={`${log.sleep.hours}h`} />
          <MetricCell label="Quality" value={`${log.sleep.quality}/10`} />
          <MetricCell label="Bedtime" value={log.sleep.bedtime} />
          <MetricCell label="Wake" value={log.sleep.waketime} />
          {log.sleep.hrv && <MetricCell label="HRV" value={`${log.sleep.hrv}ms`} />}
          {log.sleep.restingHr && <MetricCell label="Resting HR" value={`${log.sleep.restingHr}bpm`} />}
        </div>
      );
    case "workout":
      if (!log.workout) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <MetricCell label="Type" value={log.workout.type} />
          <MetricCell label="Duration" value={`${log.workout.duration}min`} />
          <MetricCell label="Intensity" value={`${log.workout.intensity}/10`} />
          {log.workout.caloriesBurned && <MetricCell label="Calories" value={`${log.workout.caloriesBurned}`} />}
          {log.workout.muscleGroups && <MetricCell label="Muscles" value={log.workout.muscleGroups} />}
        </div>
      );
    case "macros":
      if (!log.macros) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <MetricCell label="Protein" value={`${log.macros.protein}g`} />
          <MetricCell label="Carbs" value={`${log.macros.carbs}g`} />
          <MetricCell label="Fats" value={`${log.macros.fats}g`} />
          <MetricCell label="Calories" value={`${log.macros.calories}`} />
          <MetricCell label="Water" value={`${log.macros.waterOz}oz`} />
        </div>
      );
    case "health":
      if (!log.healthMetrics) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          {log.healthMetrics.mood && <MetricCell label="Mood" value={`${log.healthMetrics.mood}/10`} />}
          {log.healthMetrics.energy && <MetricCell label="Energy" value={`${log.healthMetrics.energy}/10`} />}
          {log.healthMetrics.stress && <MetricCell label="Stress" value={`${log.healthMetrics.stress}/10`} />}
          {log.healthMetrics.focus && <MetricCell label="Focus" value={`${log.healthMetrics.focus}/10`} />}
          {log.healthMetrics.weight && <MetricCell label="Weight" value={`${log.healthMetrics.weight}lbs`} />}
        </div>
      );
    case "entrepreneurial":
      if (!log.entrepreneurial) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <MetricCell label="Tasks" value={`${log.entrepreneurial.tasksCompleted}`} />
          <MetricCell label="Deep work" value={`${log.entrepreneurial.deepWorkHours}h`} />
          <MetricCell label="Revenue hrs" value={`${log.entrepreneurial.revenueActivityHours}h`} />
          {log.entrepreneurial.keyWins && <MetricCell label="Wins" value={log.entrepreneurial.keyWins.slice(0, 40)} />}
        </div>
      );
    case "finances":
      if (!log.finances) return null;
      return (
        <div className="grid grid-cols-4 gap-2 text-sm">
          <MetricCell label="Income" value={`$${log.finances.income}`} />
          <MetricCell label="Spend" value={`$${log.finances.spend}`} />
          <MetricCell label="Net" value={`$${log.finances.netForDay}`} />
        </div>
      );
    default:
      return null;
  }
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-zinc-800/50 px-2 py-1.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium text-zinc-200 truncate">{value}</div>
    </div>
  );
}

export default async function SectorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  if (!VALID_SECTORS.includes(name as SectorName)) notFound();

  const sectorName = name as SectorName;
  const config = SECTOR_CONFIG[sectorName];
  const logs = await getSectorData(sectorName);
  const scoreKey = getScoreKey(sectorName);

  const chartData = logs
    .filter((l) => l.dailyScore)
    .map((l) => ({
      date: format(l.date, "yyyy-MM-dd"),
      value: (l.dailyScore![scoreKey] as number) ?? 0,
    }));

  const avgScore =
    chartData.length > 0
      ? Math.round(chartData.reduce((a, b) => a + b.value, 0) / chartData.length)
      : 0;

  const trend =
    chartData.length >= 7
      ? chartData.slice(-3).reduce((a, b) => a + b.value, 0) / 3 -
        chartData.slice(-7, -4).reduce((a, b) => a + b.value, 0) / 3
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{config.icon}</span>
        <div>
          <h1 className="text-2xl font-bold">{config.label}</h1>
          <p className="text-zinc-400 text-sm">Last 90 days</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-zinc-500">Avg score</div>
            <div className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</div>
          </div>
          <Badge variant={trend > 5 ? "green" : trend < -5 ? "red" : "default"}>
            {trend > 0 ? "+" : ""}{Math.round(trend)} trend
          </Badge>
        </div>
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader><CardTitle>Score trend</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <TrendChart data={chartData} color={config.color} label="Score" domain={[0, 100]} />
          ) : (
            <p className="text-zinc-500 text-sm py-8 text-center">No data yet for this sector.</p>
          )}
        </CardContent>
      </Card>

      {/* History table */}
      <Card>
        <CardHeader><CardTitle>Daily log</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {logs.length === 0 && (
              <p className="text-zinc-500 text-sm py-4 text-center">No entries yet.</p>
            )}
            {[...logs].reverse().map((log) => {
              const score = log.dailyScore
                ? (log.dailyScore[scoreKey] as number)
                : null;
              const metrics = renderSectorMetrics(sectorName, log);
              if (!metrics && !score) return null;
              return (
                <div key={log.id} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">
                      {format(log.date, "MMM d, yyyy")}
                    </span>
                    {score !== null && (
                      <span className={`text-sm font-bold ${scoreColor(score)}`}>
                        {Math.round(score)}
                      </span>
                    )}
                  </div>
                  {metrics}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
