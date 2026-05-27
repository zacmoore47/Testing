"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Download, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { speak, getAvailableEnglishVoices } from "@/lib/speech";

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

const RATE_KEY = "jarvis_voice_rate";
const PITCH_KEY = "jarvis_voice_pitch";
const VOICE_KEY = "jarvis_voice_name";
const MUTE_KEY = "jarvis_voice_muted";

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceRate, setVoiceRate] = useState(0.95);
  const [voicePitch, setVoicePitch] = useState(0.85);
  const [voiceName, setVoiceName] = useState<string>("");
  const [voiceMuted, setVoiceMuted] = useState(false);

  useEffect(() => {
    const rate = parseFloat(localStorage.getItem(RATE_KEY) ?? "0.95");
    const pitch = parseFloat(localStorage.getItem(PITCH_KEY) ?? "0.85");
    const name = localStorage.getItem(VOICE_KEY) ?? "";
    const muted = localStorage.getItem(MUTE_KEY) === "true";
    setVoiceRate(isNaN(rate) ? 0.95 : rate);
    setVoicePitch(isNaN(pitch) ? 0.85 : pitch);
    setVoiceName(name);
    setVoiceMuted(muted);

    const load = () => setVoices(getAvailableEnglishVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  function saveVoiceSettings(rate: number, pitch: number, name: string, muted: boolean) {
    localStorage.setItem(RATE_KEY, String(rate));
    localStorage.setItem(PITCH_KEY, String(pitch));
    if (name) localStorage.setItem(VOICE_KEY, name); else localStorage.removeItem(VOICE_KEY);
    localStorage.setItem(MUTE_KEY, String(muted));
  }

  function handleVoiceTest() {
    void speak("Systems online, Sir.", { rate: voiceRate, pitch: voicePitch, voiceName: voiceName || null });
  }

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

      <Card>
        <CardHeader><CardTitle>🔊 Jarvis Voice</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Mute voice greeting</Label>
              <p className="text-xs text-zinc-500 mt-0.5">Disables the spoken greeting on dashboard load</p>
            </div>
            <button
              onClick={() => {
                const next = !voiceMuted;
                setVoiceMuted(next);
                saveVoiceSettings(voiceRate, voicePitch, voiceName, next);
              }}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${voiceMuted ? "bg-zinc-700" : "bg-blue-500"}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform mt-0.5 ${voiceMuted ? "translate-x-0.5" : "translate-x-5"}`} />
            </button>
          </div>

          <div>
            <Label>Voice</Label>
            <Select value={voiceName || "auto"} onValueChange={(v) => {
              const name = v === "auto" ? "" : v;
              setVoiceName(name);
              saveVoiceSettings(voiceRate, voicePitch, name, voiceMuted);
            }}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Auto-select best voice" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (recommended)</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.name} value={v.name}>{v.name} ({v.lang})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Rate — {voiceRate.toFixed(2)}</Label>
            <input
              type="range" min="0.5" max="1.5" step="0.05"
              value={voiceRate}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVoiceRate(v);
                saveVoiceSettings(v, voicePitch, voiceName, voiceMuted);
              }}
              className="w-full mt-1.5 accent-blue-500"
            />
          </div>

          <div>
            <Label>Pitch — {voicePitch.toFixed(2)}</Label>
            <input
              type="range" min="0.5" max="1.5" step="0.05"
              value={voicePitch}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVoicePitch(v);
                saveVoiceSettings(voiceRate, v, voiceName, voiceMuted);
              }}
              className="w-full mt-1.5 accent-blue-500"
            />
          </div>

          <Button variant="outline" onClick={handleVoiceTest} className="gap-2">
            <Volume2 className="h-4 w-4" /> Test voice
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
