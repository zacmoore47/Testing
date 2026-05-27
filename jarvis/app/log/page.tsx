import { getDailyLog } from "@/lib/db";
import { DailyLogForm } from "@/components/forms/DailyLogForm";
import { format } from "date-fns";
import { DailyLogInput } from "@/types";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  const dateStr = params.date ?? format(new Date(), "yyyy-MM-dd");
  const existing = await getDailyLog(new Date(dateStr));

  // Map DB record to form input shape
  const existingInput: Partial<DailyLogInput> | undefined = existing
    ? {
        date: dateStr,
        sleep: existing.sleep
          ? {
              hours: existing.sleep.hours,
              quality: existing.sleep.quality,
              bedtime: existing.sleep.bedtime,
              waketime: existing.sleep.waketime,
              remPct: existing.sleep.remPct ?? undefined,
              deepPct: existing.sleep.deepPct ?? undefined,
              hrv: existing.sleep.hrv ?? undefined,
              restingHr: existing.sleep.restingHr ?? undefined,
            }
          : undefined,
        workout: existing.workout
          ? {
              type: existing.workout.type,
              duration: existing.workout.duration,
              intensity: existing.workout.intensity,
              caloriesBurned: existing.workout.caloriesBurned ?? undefined,
              muscleGroups: existing.workout.muscleGroups ?? undefined,
            }
          : undefined,
        stimulants: existing.stimulants
          ? {
              caffeineMg: existing.stimulants.caffeineMg,
              nicotineMg: existing.stimulants.nicotineMg,
              timeConsumed: existing.stimulants.timeConsumed ?? undefined,
            }
          : undefined,
        macros: existing.macros
          ? {
              protein: existing.macros.protein,
              carbs: existing.macros.carbs,
              fats: existing.macros.fats,
              calories: existing.macros.calories,
              waterOz: existing.macros.waterOz,
              mealCount: existing.macros.mealCount,
            }
          : undefined,
        supplements: existing.supplements.map((s) => ({
          name: s.name,
          dose: s.dose,
          time: s.time ?? undefined,
          taken: s.taken,
        })),
        finances: existing.finances
          ? {
              income: existing.finances.income,
              spend: existing.finances.spend,
              netForDay: existing.finances.netForDay,
              runningMonthlyNet: existing.finances.runningMonthlyNet,
            }
          : undefined,
        healthMetrics: existing.healthMetrics
          ? {
              weight: existing.healthMetrics.weight ?? undefined,
              mood: existing.healthMetrics.mood ?? undefined,
              energy: existing.healthMetrics.energy ?? undefined,
              stress: existing.healthMetrics.stress ?? undefined,
              focus: existing.healthMetrics.focus ?? undefined,
            }
          : undefined,
        entrepreneurial: existing.entrepreneurial
          ? {
              tasksCompleted: existing.entrepreneurial.tasksCompleted,
              deepWorkHours: existing.entrepreneurial.deepWorkHours,
              revenueActivityHours: existing.entrepreneurial.revenueActivityHours,
              keyWins: existing.entrepreneurial.keyWins ?? undefined,
              blockers: existing.entrepreneurial.blockers ?? undefined,
            }
          : undefined,
      }
    : undefined;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Log Your Day</h1>
        <p className="text-zinc-400 text-sm mt-1">
          {existing ? "Updating" : "Logging"} {dateStr} — fill in what you have, skip what you don&apos;t
        </p>
      </div>
      <DailyLogForm date={dateStr} existing={existingInput} />
    </div>
  );
}
