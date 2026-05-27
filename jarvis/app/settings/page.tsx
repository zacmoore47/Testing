"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Download } from "lucide-react";
import { toast } from "sonner";

interface Profile {
  targetSleepHours: number;
  targetBedtime: string;
  targetWaketime: string;
  targetWorkoutsPerWeek: number;
  targetProtein: number;
  targetCarbs: number;
  targetFats: number;
  targetCalories: number;
  targetWater: number;
  targetDailySpend: number;
  targetMonthlySavings: number;
  targetWeight: number;
  targetProjectHours: number;
  maxCaffeineMg: number;
  overallGoals: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then((r) => r.json()).then(setProfile).catch(() => toast.error("Failed to load settings"));
  }, []);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setProfile((p) => p ? { ...p, [key]: value } : p);
  }

  async function handleSave() {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Goals saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    try {
      const res = await fetch("/api/export");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jarvis-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch {
      toast.error("Export failed");
    }
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-40 bg-zinc-800 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" /> Export data
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save goals"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>😴 Sleep goals</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Target sleep hours</Label><Input type="number" step="0.5" value={profile.targetSleepHours} onChange={(e) => set("targetSleepHours", parseFloat(e.target.value))} /></div>
          <div><Label>Target bedtime</Label><Input type="time" value={profile.targetBedtime} onChange={(e) => set("targetBedtime", e.target.value)} /></div>
          <div><Label>Target wake time</Label><Input type="time" value={profile.targetWaketime} onChange={(e) => set("targetWaketime", e.target.value)} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>💪 Fitness goals</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Workouts per week</Label><Input type="number" value={profile.targetWorkoutsPerWeek} onChange={(e) => set("targetWorkoutsPerWeek", parseInt(e.target.value))} /></div>
          <div><Label>Max caffeine (mg/day)</Label><Input type="number" value={profile.maxCaffeineMg} onChange={(e) => set("maxCaffeineMg", parseFloat(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>🥗 Nutrition goals</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Protein (g)</Label><Input type="number" value={profile.targetProtein} onChange={(e) => set("targetProtein", parseFloat(e.target.value))} /></div>
          <div><Label>Carbs (g)</Label><Input type="number" value={profile.targetCarbs} onChange={(e) => set("targetCarbs", parseFloat(e.target.value))} /></div>
          <div><Label>Fats (g)</Label><Input type="number" value={profile.targetFats} onChange={(e) => set("targetFats", parseFloat(e.target.value))} /></div>
          <div><Label>Calories</Label><Input type="number" value={profile.targetCalories} onChange={(e) => set("targetCalories", parseFloat(e.target.value))} /></div>
          <div><Label>Water (oz/day)</Label><Input type="number" value={profile.targetWater} onChange={(e) => set("targetWater", parseFloat(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>💰 Financial goals</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Daily spend limit ($)</Label><Input type="number" value={profile.targetDailySpend} onChange={(e) => set("targetDailySpend", parseFloat(e.target.value))} /></div>
          <div><Label>Monthly savings target ($)</Label><Input type="number" value={profile.targetMonthlySavings} onChange={(e) => set("targetMonthlySavings", parseFloat(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>🚀 Project goals</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div><Label>Project hours/day target</Label><Input type="number" step="0.5" value={profile.targetProjectHours} onChange={(e) => set("targetProjectHours", parseFloat(e.target.value))} /></div>
          <div><Label>Target weight (lbs)</Label><Input type="number" step="0.1" value={profile.targetWeight} onChange={(e) => set("targetWeight", parseFloat(e.target.value))} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>🎯 Overall goals</CardTitle></CardHeader>
        <CardContent>
          <Label>Tell Claude what you&apos;re optimizing for</Label>
          <textarea
            className="mt-1.5 flex min-h-[100px] w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
            value={profile.overallGoals}
            onChange={(e) => set("overallGoals", e.target.value)}
            placeholder="e.g. Build a $10k/mo business while getting to 175lbs and 8% body fat..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
