"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyLogInput } from "@/types";
import { Save, Plus, Trash2 } from "lucide-react";

interface DailyLogFormProps {
  date: string;
  existing?: Partial<DailyLogInput>;
}

interface SupplementEntry {
  name: string;
  dose: string;
  time: string;
  taken: boolean;
}

const DEFAULT_SUPPLEMENTS: SupplementEntry[] = [
  { name: "Creatine", dose: "5g", time: "08:00", taken: false },
  { name: "Vitamin D3", dose: "5000 IU", time: "08:00", taken: false },
  { name: "Magnesium", dose: "400mg", time: "21:00", taken: false },
  { name: "Omega-3", dose: "2g", time: "12:00", taken: false },
];

export function DailyLogForm({ date, existing }: DailyLogFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const sectionRefs = {
    sleep: useRef<HTMLDivElement>(null),
    workout: useRef<HTMLDivElement>(null),
    stimulants: useRef<HTMLDivElement>(null),
    macros: useRef<HTMLDivElement>(null),
    supplements: useRef<HTMLDivElement>(null),
    finances: useRef<HTMLDivElement>(null),
    health: useRef<HTMLDivElement>(null),
    entrepreneurial: useRef<HTMLDivElement>(null),
  };

  // Sleep
  const [sleepHours, setSleepHours] = useState(existing?.sleep?.hours?.toString() ?? "");
  const [sleepQuality, setSleepQuality] = useState(existing?.sleep?.quality?.toString() ?? "");
  const [bedtime, setBedtime] = useState(existing?.sleep?.bedtime ?? "22:30");
  const [waketime, setWaketime] = useState(existing?.sleep?.waketime ?? "06:30");
  const [remPct, setRemPct] = useState(existing?.sleep?.remPct?.toString() ?? "");
  const [deepPct, setDeepPct] = useState(existing?.sleep?.deepPct?.toString() ?? "");
  const [hrv, setHrv] = useState(existing?.sleep?.hrv?.toString() ?? "");
  const [restingHr, setRestingHr] = useState(existing?.sleep?.restingHr?.toString() ?? "");

  // Workout
  const [workoutType, setWorkoutType] = useState(existing?.workout?.type ?? "strength");
  const [workoutDuration, setWorkoutDuration] = useState(existing?.workout?.duration?.toString() ?? "");
  const [workoutIntensity, setWorkoutIntensity] = useState(existing?.workout?.intensity?.toString() ?? "");
  const [caloriesBurned, setCaloriesBurned] = useState(existing?.workout?.caloriesBurned?.toString() ?? "");
  const [muscleGroups, setMuscleGroups] = useState(existing?.workout?.muscleGroups ?? "");

  // Stimulants
  const [caffeineMg, setCaffeineMg] = useState(existing?.stimulants?.caffeineMg?.toString() ?? "0");
  const [nicotineMg, setNicotineMg] = useState(existing?.stimulants?.nicotineMg?.toString() ?? "0");
  const [caffeineTime, setCaffeineTime] = useState(existing?.stimulants?.timeConsumed ?? "");

  // Macros
  const [protein, setProtein] = useState(existing?.macros?.protein?.toString() ?? "");
  const [carbs, setCarbs] = useState(existing?.macros?.carbs?.toString() ?? "");
  const [fats, setFats] = useState(existing?.macros?.fats?.toString() ?? "");
  const [calories, setCalories] = useState(existing?.macros?.calories?.toString() ?? "");
  const [waterOz, setWaterOz] = useState(existing?.macros?.waterOz?.toString() ?? "");
  const [mealCount, setMealCount] = useState(existing?.macros?.mealCount?.toString() ?? "3");

  // Supplements
  const [supplements, setSupplements] = useState<SupplementEntry[]>(
    existing?.supplements?.length
      ? (existing.supplements as SupplementEntry[])
      : DEFAULT_SUPPLEMENTS
  );

  // Finances
  const [income, setIncome] = useState(existing?.finances?.income?.toString() ?? "0");
  const [spend, setSpend] = useState(existing?.finances?.spend?.toString() ?? "0");

  // Health
  const [weight, setWeight] = useState(existing?.healthMetrics?.weight?.toString() ?? "");
  const [mood, setMood] = useState(existing?.healthMetrics?.mood?.toString() ?? "");
  const [energy, setEnergy] = useState(existing?.healthMetrics?.energy?.toString() ?? "");
  const [stress, setStress] = useState(existing?.healthMetrics?.stress?.toString() ?? "");
  const [focus, setFocus] = useState(existing?.healthMetrics?.focus?.toString() ?? "");

  // Entrepreneurial
  const [tasksCompleted, setTasksCompleted] = useState(existing?.entrepreneurial?.tasksCompleted?.toString() ?? "");
  const [deepWorkHours, setDeepWorkHours] = useState(existing?.entrepreneurial?.deepWorkHours?.toString() ?? "");
  const [revenueHours, setRevenueHours] = useState(existing?.entrepreneurial?.revenueActivityHours?.toString() ?? "");
  const [keyWins, setKeyWins] = useState(existing?.entrepreneurial?.keyWins ?? "");
  const [blockers, setBlockers] = useState(existing?.entrepreneurial?.blockers ?? "");

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, keyof typeof sectionRefs> = {
        s: "sleep", w: "workout", c: "stimulants", m: "macros",
        u: "supplements", f: "finances", h: "health", e: "entrepreneurial",
      };
      const key = e.key.toLowerCase();
      if (map[key]) {
        sectionRefs[map[key]].current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calculate calories from macros
  useEffect(() => {
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fats) || 0;
    if (p || c || f) {
      setCalories(Math.round(p * 4 + c * 4 + f * 9).toString());
    }
  }, [protein, carbs, fats]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: DailyLogInput = {
        date,
        sleep: sleepHours
          ? {
              hours: parseFloat(sleepHours),
              quality: parseInt(sleepQuality) || 7,
              bedtime,
              waketime,
              remPct: remPct ? parseFloat(remPct) : undefined,
              deepPct: deepPct ? parseFloat(deepPct) : undefined,
              hrv: hrv ? parseFloat(hrv) : undefined,
              restingHr: restingHr ? parseInt(restingHr) : undefined,
            }
          : undefined,
        workout: workoutDuration
          ? {
              type: workoutType,
              duration: parseInt(workoutDuration),
              intensity: parseInt(workoutIntensity) || 7,
              caloriesBurned: caloriesBurned ? parseFloat(caloriesBurned) : undefined,
              muscleGroups: muscleGroups || undefined,
            }
          : undefined,
        stimulants: {
          caffeineMg: parseFloat(caffeineMg) || 0,
          nicotineMg: parseFloat(nicotineMg) || 0,
          timeConsumed: caffeineTime || undefined,
        },
        macros: protein
          ? {
              protein: parseFloat(protein),
              carbs: parseFloat(carbs) || 0,
              fats: parseFloat(fats) || 0,
              calories: parseFloat(calories) || 0,
              waterOz: parseFloat(waterOz) || 0,
              mealCount: parseInt(mealCount) || 3,
            }
          : undefined,
        supplements: supplements.filter((s) => s.name),
        finances: {
          income: parseFloat(income) || 0,
          spend: parseFloat(spend) || 0,
          netForDay: (parseFloat(income) || 0) - (parseFloat(spend) || 0),
          runningMonthlyNet: 0,
        },
        healthMetrics: mood
          ? {
              weight: weight ? parseFloat(weight) : undefined,
              mood: mood ? parseInt(mood) : undefined,
              energy: energy ? parseInt(energy) : undefined,
              stress: stress ? parseInt(stress) : undefined,
              focus: focus ? parseInt(focus) : undefined,
            }
          : undefined,
        entrepreneurial: deepWorkHours
          ? {
              tasksCompleted: parseInt(tasksCompleted) || 0,
              deepWorkHours: parseFloat(deepWorkHours),
              revenueActivityHours: parseFloat(revenueHours) || 0,
              keyWins: keyWins || undefined,
              blockers: blockers || undefined,
            }
          : undefined,
      };

      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      toast.success("Day logged successfully");
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const numInput = "w-full";

  return (
    <div className="space-y-6 pb-20">
      {/* Keyboard hint */}
      <div className="text-xs text-zinc-600 flex flex-wrap gap-3">
        {[["S","Sleep"],["W","Workout"],["C","Stimulants"],["M","Macros"],["U","Supplements"],["F","Finances"],["H","Health"],["E","Entrepreneur"]].map(([k,l]) => (
          <span key={k}><kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{k}</kbd> {l}</span>
        ))}
      </div>

      {/* Sleep */}
      <div ref={sectionRefs.sleep}>
        <Card>
          <CardHeader><CardTitle>😴 Sleep</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>Hours</Label><Input className={numInput} type="number" step="0.1" placeholder="7.5" value={sleepHours} onChange={e => setSleepHours(e.target.value)} /></div>
            <div><Label>Quality (1-10)</Label><Input className={numInput} type="number" min="1" max="10" placeholder="7" value={sleepQuality} onChange={e => setSleepQuality(e.target.value)} /></div>
            <div><Label>Bedtime</Label><Input className={numInput} type="time" value={bedtime} onChange={e => setBedtime(e.target.value)} /></div>
            <div><Label>Wake time</Label><Input className={numInput} type="time" value={waketime} onChange={e => setWaketime(e.target.value)} /></div>
            <div><Label>REM %</Label><Input className={numInput} type="number" placeholder="20" value={remPct} onChange={e => setRemPct(e.target.value)} /></div>
            <div><Label>Deep %</Label><Input className={numInput} type="number" placeholder="15" value={deepPct} onChange={e => setDeepPct(e.target.value)} /></div>
            <div><Label>HRV (ms)</Label><Input className={numInput} type="number" placeholder="55" value={hrv} onChange={e => setHrv(e.target.value)} /></div>
            <div><Label>Resting HR</Label><Input className={numInput} type="number" placeholder="60" value={restingHr} onChange={e => setRestingHr(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Workout */}
      <div ref={sectionRefs.workout}>
        <Card>
          <CardHeader><CardTitle>💪 Workout</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={workoutType} onValueChange={setWorkoutType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="strength">Strength</SelectItem>
                  <SelectItem value="cardio">Cardio</SelectItem>
                  <SelectItem value="mobility">Mobility</SelectItem>
                  <SelectItem value="hiit">HIIT</SelectItem>
                  <SelectItem value="rest">Rest Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Duration (min)</Label><Input className={numInput} type="number" placeholder="60" value={workoutDuration} onChange={e => setWorkoutDuration(e.target.value)} /></div>
            <div><Label>Intensity (1-10)</Label><Input className={numInput} type="number" min="1" max="10" placeholder="7" value={workoutIntensity} onChange={e => setWorkoutIntensity(e.target.value)} /></div>
            <div><Label>Calories burned</Label><Input className={numInput} type="number" placeholder="450" value={caloriesBurned} onChange={e => setCaloriesBurned(e.target.value)} /></div>
            <div className="col-span-2 md:col-span-4"><Label>Muscle groups</Label><Input type="text" placeholder="chest, triceps, shoulders" value={muscleGroups} onChange={e => setMuscleGroups(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Stimulants */}
      <div ref={sectionRefs.stimulants}>
        <Card>
          <CardHeader><CardTitle>☕ Stimulants</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>Caffeine (mg)</Label><Input className={numInput} type="number" placeholder="200" value={caffeineMg} onChange={e => setCaffeineMg(e.target.value)} /></div>
            <div><Label>Nicotine (mg)</Label><Input className={numInput} type="number" placeholder="0" value={nicotineMg} onChange={e => setNicotineMg(e.target.value)} /></div>
            <div><Label>Times consumed</Label><Input type="text" placeholder="07:00, 12:30" value={caffeineTime} onChange={e => setCaffeineTime(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Macros */}
      <div ref={sectionRefs.macros}>
        <Card>
          <CardHeader><CardTitle>🥗 Nutrition</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>Protein (g)</Label><Input className={numInput} type="number" placeholder="180" value={protein} onChange={e => setProtein(e.target.value)} /></div>
            <div><Label>Carbs (g)</Label><Input className={numInput} type="number" placeholder="250" value={carbs} onChange={e => setCarbs(e.target.value)} /></div>
            <div><Label>Fats (g)</Label><Input className={numInput} type="number" placeholder="70" value={fats} onChange={e => setFats(e.target.value)} /></div>
            <div><Label>Calories</Label><Input className={numInput} type="number" placeholder="2400" value={calories} onChange={e => setCalories(e.target.value)} /></div>
            <div><Label>Water (oz)</Label><Input className={numInput} type="number" placeholder="100" value={waterOz} onChange={e => setWaterOz(e.target.value)} /></div>
            <div><Label>Meals</Label><Input className={numInput} type="number" placeholder="3" value={mealCount} onChange={e => setMealCount(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Supplements */}
      <div ref={sectionRefs.supplements}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>💊 Supplements</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSupplements(s => [...s, { name: "", dose: "", time: "", taken: false }])}>
                <Plus className="h-4 w-4 mr-1" /> Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {supplements.map((sup, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={sup.taken}
                  onChange={e => setSupplements(s => s.map((x, j) => j === i ? { ...x, taken: e.target.checked } : x))}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500"
                />
                <Input placeholder="Name" value={sup.name} onChange={e => setSupplements(s => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1" />
                <Input placeholder="Dose" value={sup.dose} onChange={e => setSupplements(s => s.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} className="w-24" />
                <Input type="time" value={sup.time} onChange={e => setSupplements(s => s.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} className="w-28" />
                <Button variant="ghost" size="icon" onClick={() => setSupplements(s => s.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4 text-zinc-600" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Finances */}
      <div ref={sectionRefs.finances}>
        <Card>
          <CardHeader><CardTitle>💰 Finances</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div><Label>Income ($)</Label><Input className={numInput} type="number" placeholder="500" value={income} onChange={e => setIncome(e.target.value)} /></div>
            <div><Label>Spend ($)</Label><Input className={numInput} type="number" placeholder="100" value={spend} onChange={e => setSpend(e.target.value)} /></div>
            <div className="col-span-2 text-sm text-zinc-400">
              Net: <span className={parseFloat(income) - parseFloat(spend) >= 0 ? "text-green-400" : "text-red-400"}>
                ${((parseFloat(income) || 0) - (parseFloat(spend) || 0)).toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Health Metrics */}
      <div ref={sectionRefs.health}>
        <Card>
          <CardHeader><CardTitle>❤️ Health Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><Label>Weight (lbs)</Label><Input className={numInput} type="number" step="0.1" placeholder="180" value={weight} onChange={e => setWeight(e.target.value)} /></div>
            <div><Label>Mood (1-10)</Label><Input className={numInput} type="number" min="1" max="10" value={mood} onChange={e => setMood(e.target.value)} /></div>
            <div><Label>Energy (1-10)</Label><Input className={numInput} type="number" min="1" max="10" value={energy} onChange={e => setEnergy(e.target.value)} /></div>
            <div><Label>Stress (1-10)</Label><Input className={numInput} type="number" min="1" max="10" value={stress} onChange={e => setStress(e.target.value)} /></div>
            <div><Label>Focus (1-10)</Label><Input className={numInput} type="number" min="1" max="10" value={focus} onChange={e => setFocus(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Entrepreneurial */}
      <div ref={sectionRefs.entrepreneurial}>
        <Card>
          <CardHeader><CardTitle>🚀 Entrepreneurial</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>Tasks completed</Label><Input className={numInput} type="number" placeholder="8" value={tasksCompleted} onChange={e => setTasksCompleted(e.target.value)} /></div>
            <div><Label>Deep work (hrs)</Label><Input className={numInput} type="number" step="0.5" placeholder="4" value={deepWorkHours} onChange={e => setDeepWorkHours(e.target.value)} /></div>
            <div><Label>Revenue activity (hrs)</Label><Input className={numInput} type="number" step="0.5" placeholder="3" value={revenueHours} onChange={e => setRevenueHours(e.target.value)} /></div>
            <div className="col-span-2 md:col-span-3">
              <Label>Key wins</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                placeholder="Closed deal with X, shipped feature Y..."
                value={keyWins}
                onChange={e => setKeyWins(e.target.value)}
              />
            </div>
            <div className="col-span-2 md:col-span-3">
              <Label>Blockers</Label>
              <textarea
                className="flex min-h-[60px] w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                placeholder="Waiting on X, blocked by Y..."
                value={blockers}
                onChange={e => setBlockers(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur p-4 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Logging {date}</span>
        <Button variant="primary" onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save day"}
        </Button>
      </div>
    </div>
  );
}
