"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyLogInput, ProjectRow } from "@/types";
import { Save, Plus, Trash2 } from "lucide-react";
import { FastAddTransaction } from "@/components/finance/FastAddTransaction";

interface SupplementEntry {
  name: string;
  dose: string;
  time: string;
  taken: boolean;
}

interface ProjectLogEntry {
  projectId: number;
  projectName: string;
  hoursWorked: string;
  whatWasCompleted: string;
  blockers: string;
}

interface DailyLogFormProps {
  date: string;
  existing?: Partial<DailyLogInput>;
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
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectLogs, setProjectLogs] = useState<ProjectLogEntry[]>([]);

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

  // Workout
  const [workoutType, setWorkoutType] = useState(existing?.workout?.type ?? "strength");
  const [workoutDuration, setWorkoutDuration] = useState(existing?.workout?.duration?.toString() ?? "");
  const [workoutIntensity, setWorkoutIntensity] = useState(existing?.workout?.intensity?.toString() ?? "");
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

  // Health
  const [weight, setWeight] = useState(existing?.healthMetrics?.weight?.toString() ?? "");
  const [mood, setMood] = useState(existing?.healthMetrics?.mood?.toString() ?? "");
  const [energy, setEnergy] = useState(existing?.healthMetrics?.energy?.toString() ?? "");
  const [stress, setStress] = useState(existing?.healthMetrics?.stress?.toString() ?? "");
  const [focus, setFocus] = useState(existing?.healthMetrics?.focus?.toString() ?? "");

  // Load active projects
  useEffect(() => {
    fetch("/api/projects?status=Active").then((r) => r.json()).then(setProjects).catch(() => {});
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const map: Record<string, keyof typeof sectionRefs> = {
        s: "sleep", w: "workout", c: "stimulants", m: "macros",
        u: "supplements", f: "finances", h: "health", e: "entrepreneurial",
      };
      const key = e.key.toLowerCase();
      if (map[key]) sectionRefs[map[key]].current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-calc calories
  useEffect(() => {
    const p = parseFloat(protein) || 0;
    const c = parseFloat(carbs) || 0;
    const f = parseFloat(fats) || 0;
    if (p || c || f) setCalories(Math.round(p * 4 + c * 4 + f * 9).toString());
  }, [protein, carbs, fats]);

  function addProjectLog() {
    if (projects.length === 0) return;
    const first = projects[0];
    setProjectLogs((prev) => [
      ...prev,
      { projectId: first.id, projectName: first.name, hoursWorked: "", whatWasCompleted: "", blockers: "" },
    ]);
  }

  async function saveProjectLogs() {
    for (const pl of projectLogs) {
      if (!pl.whatWasCompleted || !pl.hoursWorked) continue;
      await fetch("/api/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pl.projectId,
          date,
          hoursWorked: parseFloat(pl.hoursWorked),
          whatWasCompleted: pl.whatWasCompleted,
          blockers: pl.blockers || undefined,
        }),
      });
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload: DailyLogInput = {
        date,
        sleep: sleepHours
          ? { hours: parseFloat(sleepHours), quality: parseInt(sleepQuality) || 7, bedtime, waketime }
          : undefined,
        workout: workoutDuration
          ? { type: workoutType, duration: parseInt(workoutDuration), intensity: parseInt(workoutIntensity) || 7, muscleGroups: muscleGroups || undefined }
          : undefined,
        stimulants: { caffeineMg: parseFloat(caffeineMg) || 0, nicotineMg: parseFloat(nicotineMg) || 0, timeConsumed: caffeineTime || undefined },
        macros: protein
          ? { protein: parseFloat(protein), carbs: parseFloat(carbs) || 0, fats: parseFloat(fats) || 0, calories: parseFloat(calories) || 0, waterOz: parseFloat(waterOz) || 0, mealCount: parseInt(mealCount) || 3 }
          : undefined,
        supplements: supplements.filter((s) => s.name),
        healthMetrics: mood
          ? { weight: weight ? parseFloat(weight) : undefined, mood: parseInt(mood), energy: energy ? parseInt(energy) : undefined, stress: stress ? parseInt(stress) : undefined, focus: focus ? parseInt(focus) : undefined }
          : undefined,
      };

      const res = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());

      await saveProjectLogs();

      toast.success("Day logged successfully");
      router.push("/");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Keyboard hints */}
      <div className="text-xs text-zinc-600 flex flex-wrap gap-3">
        {[["S","Sleep"],["W","Workout"],["C","Caffeine"],["M","Macros"],["U","Supplements"],["F","Finances"],["H","Health"],["E","Projects"]].map(([k,l]) => (
          <span key={k}><kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-400">{k}</kbd> {l}</span>
        ))}
      </div>

      {/* Sleep */}
      <div ref={sectionRefs.sleep}>
        <Card>
          <CardHeader><CardTitle>😴 Sleep</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>Hours</Label><Input type="number" step="0.1" placeholder="7.5" value={sleepHours} onChange={(e) => setSleepHours(e.target.value)} /></div>
            <div>
              <Label>Quality (1-10)</Label>
              <Input type="number" min="1" max="10" placeholder="7" value={sleepQuality} onChange={(e) => setSleepQuality(e.target.value)} />
            </div>
            <div><Label>Bedtime</Label><Input type="time" value={bedtime} onChange={(e) => setBedtime(e.target.value)} /></div>
            <div><Label>Wake time</Label><Input type="time" value={waketime} onChange={(e) => setWaketime(e.target.value)} /></div>
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
                  {["strength","cardio","mobility","hiit","rest"].map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Duration (min)</Label><Input type="number" placeholder="60" value={workoutDuration} onChange={(e) => setWorkoutDuration(e.target.value)} /></div>
            <div><Label>Intensity (1-10)</Label><Input type="number" min="1" max="10" placeholder="7" value={workoutIntensity} onChange={(e) => setWorkoutIntensity(e.target.value)} /></div>
            <div><Label>Muscle groups</Label><Input type="text" placeholder="chest, triceps" value={muscleGroups} onChange={(e) => setMuscleGroups(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Stimulants */}
      <div ref={sectionRefs.stimulants}>
        <Card>
          <CardHeader><CardTitle>☕ Stimulants</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><Label>Caffeine (mg)</Label><Input type="number" placeholder="200" value={caffeineMg} onChange={(e) => setCaffeineMg(e.target.value)} /></div>
            <div><Label>Nicotine (mg)</Label><Input type="number" placeholder="0" value={nicotineMg} onChange={(e) => setNicotineMg(e.target.value)} /></div>
            <div><Label>Times consumed</Label><Input type="text" placeholder="07:00, 12:30" value={caffeineTime} onChange={(e) => setCaffeineTime(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Macros */}
      <div ref={sectionRefs.macros}>
        <Card>
          <CardHeader><CardTitle>🥗 Nutrition</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><Label>Protein (g)</Label><Input type="number" placeholder="180" value={protein} onChange={(e) => setProtein(e.target.value)} /></div>
            <div><Label>Carbs (g)</Label><Input type="number" placeholder="250" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></div>
            <div><Label>Fats (g)</Label><Input type="number" placeholder="70" value={fats} onChange={(e) => setFats(e.target.value)} /></div>
            <div><Label>Calories (auto)</Label><Input type="number" placeholder="2400" value={calories} onChange={(e) => setCalories(e.target.value)} /></div>
            <div><Label>Water (oz)</Label><Input type="number" placeholder="100" value={waterOz} onChange={(e) => setWaterOz(e.target.value)} /></div>
            <div><Label>Meals</Label><Input type="number" placeholder="3" value={mealCount} onChange={(e) => setMealCount(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Supplements */}
      <div ref={sectionRefs.supplements}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>💊 Supplements</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setSupplements((s) => [...s, { name: "", dose: "", time: "", taken: false }])}>
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
                  onChange={(e) => setSupplements((s) => s.map((x, j) => j === i ? { ...x, taken: e.target.checked } : x))}
                  className="h-4 w-4 rounded border-zinc-600 accent-blue-500"
                />
                <Input placeholder="Name" value={sup.name} onChange={(e) => setSupplements((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="flex-1" />
                <Input placeholder="Dose" value={sup.dose} onChange={(e) => setSupplements((s) => s.map((x, j) => j === i ? { ...x, dose: e.target.value } : x))} className="w-24" />
                <Input type="time" value={sup.time} onChange={(e) => setSupplements((s) => s.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} className="w-28" />
                <Button variant="ghost" size="icon" onClick={() => setSupplements((s) => s.filter((_, j) => j !== i))}>
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
          <CardContent>
            <FastAddTransaction date={date} />
          </CardContent>
        </Card>
      </div>

      {/* Health */}
      <div ref={sectionRefs.health}>
        <Card>
          <CardHeader><CardTitle>❤️ Health Metrics</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div><Label>Weight (lbs)</Label><Input type="number" step="0.1" placeholder="180" value={weight} onChange={(e) => setWeight(e.target.value)} /></div>
            <div><Label>Mood (1-10)</Label><Input type="number" min="1" max="10" value={mood} onChange={(e) => setMood(e.target.value)} /></div>
            <div><Label>Energy (1-10)</Label><Input type="number" min="1" max="10" value={energy} onChange={(e) => setEnergy(e.target.value)} /></div>
            <div><Label>Stress (1-10)</Label><Input type="number" min="1" max="10" value={stress} onChange={(e) => setStress(e.target.value)} /></div>
            <div><Label>Focus (1-10)</Label><Input type="number" min="1" max="10" value={focus} onChange={(e) => setFocus(e.target.value)} /></div>
          </CardContent>
        </Card>
      </div>

      {/* Projects */}
      <div ref={sectionRefs.entrepreneurial}>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>🚀 Project Work</CardTitle>
              <Button variant="ghost" size="sm" onClick={addProjectLog} disabled={projects.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Log project
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {projects.length === 0 && (
              <p className="text-sm text-zinc-500 text-center py-2">No active projects. <a href="/projects" className="text-blue-400 hover:underline">Create one</a></p>
            )}
            {projectLogs.map((pl, i) => (
              <div key={i} className="rounded-lg border border-zinc-700 p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Select
                    value={pl.projectId.toString()}
                    onValueChange={(v) => setProjectLogs((logs) => logs.map((l, j) => j === i ? { ...l, projectId: parseInt(v), projectName: projects.find((p) => p.id === parseInt(v))?.name ?? "" } : l))}
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="Hours"
                    className="w-24"
                    value={pl.hoursWorked}
                    onChange={(e) => setProjectLogs((logs) => logs.map((l, j) => j === i ? { ...l, hoursWorked: e.target.value } : l))}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setProjectLogs((logs) => logs.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-zinc-600" />
                  </Button>
                </div>
                <Input
                  placeholder="What was completed? (required)"
                  value={pl.whatWasCompleted}
                  onChange={(e) => setProjectLogs((logs) => logs.map((l, j) => j === i ? { ...l, whatWasCompleted: e.target.value } : l))}
                />
                <Input
                  placeholder="Blockers (optional)"
                  value={pl.blockers}
                  onChange={(e) => setProjectLogs((logs) => logs.map((l, j) => j === i ? { ...l, blockers: e.target.value } : l))}
                />
              </div>
            ))}
            {projectLogs.length === 0 && projects.length > 0 && (
              <p className="text-sm text-zinc-600 text-center py-2">Click &quot;Log project&quot; to record work done today</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save bar */}
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
