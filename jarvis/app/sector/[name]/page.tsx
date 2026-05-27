import { prisma } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TrendChart } from "@/components/charts/TrendChart";
import { Badge } from "@/components/ui/badge";
import { scoreColor } from "@/lib/utils";
import { format, subDays, startOfDay } from "date-fns";
import { notFound } from "next/navigation";
import { SectorName } from "@/types";

const SECTOR_CONFIG: Record<SectorName, { label: string; icon: string; color: string }> = {
  sleep:          { label: "Sleep",         icon: "😴", color: "#818cf8" },
  workout:        { label: "Workout",       icon: "💪", color: "#34d399" },
  stimulants:     { label: "Stimulants",    icon: "☕", color: "#fb923c" },
  macros:         { label: "Nutrition",     icon: "🥗", color: "#4ade80" },
  supplements:    { label: "Supplements",   icon: "💊", color: "#a78bfa" },
  finances:       { label: "Finances",      icon: "💰", color: "#fbbf24" },
  health:         { label: "Health",        icon: "❤️", color: "#f87171" },
  entrepreneurial:{ label: "Projects",      icon: "🚀", color: "#60a5fa" },
  habits:         { label: "Habits",        icon: "✅", color: "#34d399" },
};

const VALID_SECTORS = Object.keys(SECTOR_CONFIG) as SectorName[];

const SCORE_KEY_MAP: Record<SectorName, string> = {
  sleep: "sleepScore", workout: "workoutScore", stimulants: "stimulantsScore",
  macros: "macrosScore", supplements: "supplementsScore", finances: "financesScore",
  health: "healthScore", entrepreneurial: "entrepreneurialScore", habits: "habitScore",
};

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-zinc-800/50 px-2 py-1.5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-medium text-zinc-200 truncate">{value}</div>
    </div>
  );
}

async function getFinanceSectorData() {
  const cutoff = subDays(startOfDay(new Date()), 30);
  const [expenses, incomes] = await Promise.all([
    prisma.expense.findMany({ where: { date: { gte: cutoff } }, orderBy: { date: "desc" } }),
    prisma.income.findMany({ where: { date: { gte: cutoff } }, orderBy: { date: "desc" } }),
  ]);
  return { expenses, incomes };
}

async function getSectorLogs(name: SectorName) {
  const cutoff = subDays(startOfDay(new Date()), 90);
  return prisma.dailyLog.findMany({
    where: { date: { gte: cutoff } },
    include: {
      sleep: name === "sleep",
      workout: name === "workout",
      stimulants: name === "stimulants",
      macros: name === "macros",
      supplements: name === "supplements",
      healthMetrics: name === "health",
      dailyScore: true,
    },
    orderBy: { date: "asc" },
  });
}

export default async function SectorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!VALID_SECTORS.includes(name as SectorName)) notFound();

  const sectorName = name as SectorName;
  const config = SECTOR_CONFIG[sectorName];
  const scoreKey = SCORE_KEY_MAP[sectorName] as keyof NonNullable<Awaited<ReturnType<typeof getSectorLogs>>[0]["dailyScore"]>;

  // Special handling for finance sector
  if (sectorName === "finances") {
    const { expenses, incomes } = await getFinanceSectorData();

    // Daily net for chart
    const dayMap = new Map<string, { expenses: number; income: number }>();
    expenses.forEach((e) => {
      const d = format(e.date, "yyyy-MM-dd");
      const cur = dayMap.get(d) ?? { expenses: 0, income: 0 };
      dayMap.set(d, { ...cur, expenses: cur.expenses + e.amount });
    });
    incomes.forEach((i) => {
      const d = format(i.date, "yyyy-MM-dd");
      const cur = dayMap.get(d) ?? { expenses: 0, income: 0 };
      dayMap.set(d, { ...cur, income: cur.income + i.amount });
    });

    const chartData = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, value: vals.income - vals.expenses }));

    const catTotals: Record<string, number> = {};
    expenses.forEach((e) => { catTotals[e.category] = (catTotals[e.category] ?? 0) + e.amount; });
    const topCategories = Object.entries(catTotals).sort(([,a],[,b]) => b - a).slice(0, 5);

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{config.icon}</span>
          <div><h1 className="text-2xl font-bold">{config.label}</h1><p className="text-zinc-400 text-sm">Last 30 days</p></div>
        </div>

        <Card>
          <CardHeader><CardTitle>Daily net (income − expenses)</CardTitle></CardHeader>
          <CardContent>
            {chartData.length > 0
              ? <TrendChart data={chartData} color={config.color} label="Net $" />
              : <p className="text-zinc-500 text-sm py-8 text-center">No data yet.</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Top spending categories</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {topCategories.map(([cat, total]) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{cat}</span>
                  <span className="text-red-400 font-medium">${total.toFixed(2)}</span>
                </div>
              ))}
              {topCategories.length === 0 && <p className="text-zinc-500 text-sm">No expenses yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 max-h-64 overflow-y-auto">
              {[...expenses.slice(0, 10).map((e) => ({ type: "expense" as const, ...e })),
                ...incomes.slice(0, 10).map((i) => ({ type: "income" as const, ...i }))
              ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
               .slice(0, 15)
               .map((t) => (
                <div key={`${t.type}-${t.id}`} className="flex items-center gap-2 text-sm">
                  <span className={`w-16 shrink-0 font-medium ${t.type === "expense" ? "text-red-400" : "text-green-400"}`}>
                    {t.type === "expense" ? "-" : "+"}${t.amount.toFixed(2)}
                  </span>
                  <span className="text-zinc-400 text-xs w-20 shrink-0">{format(t.date, "MMM d")}</span>
                  <span className="text-zinc-300 truncate">
                    {"category" in t ? t.category : t.source}
                    {t.description ? ` — ${t.description}` : ""}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Standard sector handling
  const logs = await getSectorLogs(sectorName);

  const chartData = logs
    .filter((l) => l.dailyScore)
    .map((l) => ({ date: format(l.date, "yyyy-MM-dd"), value: (l.dailyScore![scoreKey] as number) ?? 0 }));

  const avgScore = chartData.length > 0
    ? Math.round(chartData.reduce((a, b) => a + b.value, 0) / chartData.length)
    : 0;

  const trend = chartData.length >= 7
    ? chartData.slice(-3).reduce((a, b) => a + b.value, 0) / 3 -
      chartData.slice(-7, -4).reduce((a, b) => a + b.value, 0) / 3
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{config.icon}</span>
        <div><h1 className="text-2xl font-bold">{config.label}</h1><p className="text-zinc-400 text-sm">Last 90 days</p></div>
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

      <Card>
        <CardHeader><CardTitle>Score trend</CardTitle></CardHeader>
        <CardContent>
          {chartData.length > 0
            ? <TrendChart data={chartData} color={config.color} label="Score" domain={[0, 100]} />
            : <p className="text-zinc-500 text-sm py-8 text-center">No data yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Daily log</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...logs].reverse().map((log) => {
              const score = log.dailyScore ? (log.dailyScore[scoreKey] as number) : null;
              let metrics: React.ReactNode = null;

              if (sectorName === "sleep" && log.sleep) {
                metrics = (
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <MetricCell label="Hours" value={`${log.sleep.hours}h`} />
                    <MetricCell label="Quality" value={`${log.sleep.quality}/10`} />
                    <MetricCell label="Bedtime" value={log.sleep.bedtime} />
                    <MetricCell label="Wake" value={log.sleep.waketime} />
                  </div>
                );
              } else if (sectorName === "workout" && log.workout) {
                metrics = (
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <MetricCell label="Type" value={log.workout.type} />
                    <MetricCell label="Duration" value={`${log.workout.duration}min`} />
                    <MetricCell label="Intensity" value={`${log.workout.intensity}/10`} />
                    {log.workout.muscleGroups && <MetricCell label="Muscles" value={log.workout.muscleGroups} />}
                  </div>
                );
              } else if (sectorName === "macros" && log.macros) {
                metrics = (
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <MetricCell label="Protein" value={`${log.macros.protein}g`} />
                    <MetricCell label="Carbs" value={`${log.macros.carbs}g`} />
                    <MetricCell label="Fats" value={`${log.macros.fats}g`} />
                    <MetricCell label="Calories" value={`${Math.round(log.macros.calories)}`} />
                  </div>
                );
              } else if (sectorName === "health" && log.healthMetrics) {
                metrics = (
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    {log.healthMetrics.mood && <MetricCell label="Mood" value={`${log.healthMetrics.mood}/10`} />}
                    {log.healthMetrics.energy && <MetricCell label="Energy" value={`${log.healthMetrics.energy}/10`} />}
                    {log.healthMetrics.stress && <MetricCell label="Stress" value={`${log.healthMetrics.stress}/10`} />}
                    {log.healthMetrics.focus && <MetricCell label="Focus" value={`${log.healthMetrics.focus}/10`} />}
                  </div>
                );
              }

              if (!metrics && !score) return null;
              return (
                <div key={log.id} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">{format(log.date, "MMM d, yyyy")}</span>
                    {score !== null && <span className={`text-sm font-bold ${scoreColor(score)}`}>{Math.round(score)}</span>}
                  </div>
                  {metrics}
                </div>
              );
            })}
            {logs.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center">No entries yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
