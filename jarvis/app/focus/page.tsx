"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { playCompletionChime, createBrownNoise } from "@/lib/chime";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { ProjectRow, TaskRow } from "@/types";
import { Volume2, VolumeX, SkipForward, Square, Play, Pause } from "lucide-react";

type Phase = "setup" | "work" | "work_paused" | "work_done" | "break" | "break_paused" | "break_done";
type SessionType = "Work" | "ShortBreak" | "LongBreak";

interface Config {
  projectId: string;
  taskId: string;
  workMinutes: number;
  shortBreak: number;
  longBreak: number;
  sessionsBeforeLong: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function Tomatoes({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`text-lg transition-all ${i < done ? "opacity-100" : "opacity-25"}`}>🍅</span>
      ))}
    </div>
  );
}

export default function FocusPage() {
  const { speak } = useJarvisVoice();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [config, setConfig] = useState<Config>({
    projectId: "none", taskId: "none",
    workMinutes: 25, shortBreak: 5, longBreak: 15, sessionsBeforeLong: 4,
  });
  const [phase, setPhase] = useState<Phase>("setup");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [sessionNum, setSessionNum] = useState(0);
  const [sessionDbId, setSessionDbId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [taskCompletePrompt, setTaskCompletePrompt] = useState(false);
  const [ambientOn, setAmbientOn] = useState(false);
  const ambientRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load projects + default config
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    fetch("/api/profile").then((r) => r.json()).then((p) => {
      if (p.defaultWorkMinutes) setConfig((c) => ({
        ...c,
        workMinutes: p.defaultWorkMinutes,
        shortBreak: p.defaultShortBreak,
        longBreak: p.defaultLongBreak,
        sessionsBeforeLong: p.sessionsBeforeLongBreak,
      }));
    }).catch(() => {});
  }, []);

  // Load tasks when project changes
  useEffect(() => {
    if (config.projectId === "none") { setTasks([]); return; }
    fetch(`/api/tasks?status=Pending&projectId=${config.projectId}`)
      .then((r) => r.json()).then(setTasks).catch(() => {});
  }, [config.projectId]);

  // Update page title
  useEffect(() => {
    if (phase === "work" || phase === "work_paused") {
      document.title = `${formatTime(secondsLeft)} — Jarvis Focus`;
    } else if (phase === "break" || phase === "break_paused") {
      document.title = `${formatTime(secondsLeft)} — Break`;
    } else {
      document.title = "Jarvis Focus";
    }
    return () => { document.title = "Jarvis"; };
  }, [phase, secondsLeft]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space" && phase !== "setup" && phase !== "work_done" && phase !== "break_done") {
        e.preventDefault();
        if (phase === "work") setPhase("work_paused");
        else if (phase === "work_paused") setPhase("work");
        else if (phase === "break") setPhase("break_paused");
        else if (phase === "break_paused") setPhase("break");
      }
      if (e.code === "Escape" && (phase === "work" || phase === "work_paused" || phase === "break" || phase === "break_paused")) {
        if (confirm("Cancel this focus session?")) void handleCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Countdown
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (phase === "work" || phase === "break") {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(intervalRef.current!);
            if (phase === "work") handleWorkComplete();
            else handleBreakComplete();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleWorkComplete = useCallback(() => {
    playCompletionChime();
    void speak("Focus block complete, Sir. Well done.");
    setPhase("work_done");
    if (config.taskId !== "none") setTaskCompletePrompt(true);
  }, [speak, config.taskId]);

  const handleBreakComplete = useCallback(() => {
    playCompletionChime();
    void speak("Break complete. Ready when you are, Sir.");
    setPhase("break_done");
  }, [speak]);

  async function startWork() {
    const res = await fetch("/api/focus-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: config.projectId !== "none" ? parseInt(config.projectId) : null,
        taskId: config.taskId !== "none" ? parseInt(config.taskId) : null,
        plannedMinutes: config.workMinutes,
        sessionType: "Work",
      }),
    });
    const session = await res.json();
    setSessionDbId(session.id);
    setSessionStartTime(new Date());
    setSecondsLeft(config.workMinutes * 60);
    setSessionNum((n) => n + 1);
    setPhase("work");
    if (ambientOn && !ambientRef.current) {
      ambientRef.current = createBrownNoise();
      ambientRef.current?.start();
    }
  }

  async function handleSaveAndBreak() {
    if (sessionDbId) {
      const actual = sessionStartTime
        ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
        : config.workMinutes;
      await fetch(`/api/focus-sessions/${sessionDbId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString(), actualMinutes: actual, completed: true, notes: notes || null }),
      });
    }
    if (taskCompletePrompt) setTaskCompletePrompt(false);
    setNotes("");
    ambientRef.current?.stop();
    ambientRef.current = null;
    // Start break
    const isLong = sessionNum % config.sessionsBeforeLong === 0;
    const breakMins = isLong ? config.longBreak : config.shortBreak;
    const breakType: SessionType = isLong ? "LongBreak" : "ShortBreak";
    const res = await fetch("/api/focus-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannedMinutes: breakMins, sessionType: breakType }),
    });
    const bSession = await res.json();
    setSessionDbId(bSession.id);
    setSessionStartTime(new Date());
    setSecondsLeft(breakMins * 60);
    setPhase("break");
  }

  async function handleEndBreakStartWork() {
    if (sessionDbId) {
      const actual = sessionStartTime
        ? Math.round((Date.now() - sessionStartTime.getTime()) / 60000)
        : 5;
      await fetch(`/api/focus-sessions/${sessionDbId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString(), actualMinutes: actual, completed: true }),
      });
    }
    await startWork();
  }

  async function handleCancel() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    ambientRef.current?.stop();
    ambientRef.current = null;
    if (sessionDbId && sessionStartTime) {
      const actual = Math.round((Date.now() - sessionStartTime.getTime()) / 60000);
      await fetch(`/api/focus-sessions/${sessionDbId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endedAt: new Date().toISOString(), actualMinutes: actual, completed: false }),
      });
    }
    setPhase("setup");
    setSessionNum(0);
    setSessionDbId(null);
    document.title = "Jarvis";
  }

  async function handleTaskAction(action: "complete" | "snooze" | "no") {
    if (action === "complete" && config.taskId !== "none") {
      await fetch(`/api/tasks/${config.taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
    }
    setTaskCompletePrompt(false);
  }

  const selectedProject = projects.find((p) => p.id === parseInt(config.projectId));
  const selectedTask = tasks.find((t) => t.id === parseInt(config.taskId));

  const isWork = phase === "work" || phase === "work_paused";
  const isBreak = phase === "break" || phase === "break_paused";
  const bgClass = isWork
    ? "bg-gradient-to-b from-blue-950/40 to-zinc-950"
    : isBreak
    ? "bg-gradient-to-b from-green-950/30 to-zinc-950"
    : "bg-zinc-950";

  // ── Setup screen ──────────────────────────────────────────────────────────
  if (phase === "setup") {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-2xl font-bold text-center">Focus Mode</h1>

          <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div>
              <Label>Project (optional)</Label>
              <Select value={config.projectId} onValueChange={(v) => setConfig((c) => ({ ...c, projectId: v, taskId: "none" }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="No project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.filter((p) => p.status === "Active").map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tasks.length > 0 && (
              <div>
                <Label>Task (optional)</Label>
                <Select value={config.taskId} onValueChange={(v) => setConfig((c) => ({ ...c, taskId: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="No specific task" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific task</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>P{t.priority} — {t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Work (min)</Label>
                <Input type="number" min={1} max={120} value={config.workMinutes} onChange={(e) => setConfig((c) => ({ ...c, workMinutes: parseInt(e.target.value) || 25 }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Short break</Label>
                <Input type="number" min={1} max={30} value={config.shortBreak} onChange={(e) => setConfig((c) => ({ ...c, shortBreak: parseInt(e.target.value) || 5 }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Long break</Label>
                <Input type="number" min={1} max={60} value={config.longBreak} onChange={(e) => setConfig((c) => ({ ...c, longBreak: parseInt(e.target.value) || 15 }))} className="mt-1.5" />
              </div>
              <div>
                <Label>Sessions before long</Label>
                <Input type="number" min={1} max={8} value={config.sessionsBeforeLong} onChange={(e) => setConfig((c) => ({ ...c, sessionsBeforeLong: parseInt(e.target.value) || 4 }))} className="mt-1.5" />
              </div>
            </div>
          </div>

          <Button variant="primary" className="w-full h-12 text-base" onClick={startWork}>
            Start Focus Block
          </Button>
        </div>
      </div>
    );
  }

  // ── Timer screen ──────────────────────────────────────────────────────────
  return (
    <div className={`min-h-[80vh] flex flex-col items-center justify-center transition-colors duration-1000 ${bgClass}`}>
      {/* Session label */}
      <p className="text-sm font-medium text-zinc-400 mb-6 tracking-wider uppercase">
        {isWork ? `Work Session ${sessionNum} of ${config.sessionsBeforeLong}` : "Break"}
      </p>

      {/* Big timer */}
      <div className="font-mono text-[clamp(80px,18vw,140px)] font-bold leading-none tabular-nums text-zinc-100 mb-4">
        {formatTime(secondsLeft)}
      </div>

      {/* Context */}
      <div className="text-center mb-8 space-y-1">
        {selectedProject && <p className="text-zinc-400 text-sm">{selectedProject.name}</p>}
        {selectedTask && <p className="text-zinc-500 text-xs">{selectedTask.title}</p>}
      </div>

      {/* Tomato progress */}
      <div className="mb-10">
        <Tomatoes done={sessionNum} total={config.sessionsBeforeLong} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {(phase === "work" || phase === "break") && (
          <Button variant="outline" className="gap-2" onClick={() => setPhase(phase === "work" ? "work_paused" : "break_paused")}>
            <Pause className="h-4 w-4" /> Pause
          </Button>
        )}
        {(phase === "work_paused" || phase === "break_paused") && (
          <Button variant="primary" className="gap-2" onClick={() => setPhase(phase === "work_paused" ? "work" : "break")}>
            <Play className="h-4 w-4" /> Resume
          </Button>
        )}
        {isWork && (
          <Button variant="outline" className="gap-2" onClick={handleWorkComplete}>
            <SkipForward className="h-4 w-4" /> Skip
          </Button>
        )}
        {isBreak && (
          <Button variant="outline" className="gap-2" onClick={() => setPhase("break_done")}>
            <SkipForward className="h-4 w-4" /> Skip break
          </Button>
        )}
        <Button
          variant="outline"
          className="gap-2 text-zinc-500"
          onClick={() => {
            if (ambientOn) {
              ambientRef.current?.stop();
              ambientRef.current = null;
              setAmbientOn(false);
            } else {
              const n = createBrownNoise();
              if (n) { n.start(); ambientRef.current = n; setAmbientOn(true); }
            }
          }}
        >
          {ambientOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <Button variant="outline" className="gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => { if (confirm("Cancel this session?")) void handleCancel(); }}>
          <Square className="h-4 w-4" /> Cancel
        </Button>
      </div>

      <p className="mt-6 text-xs text-zinc-600">Space = pause/resume · Esc = cancel</p>

      {/* Work done overlay */}
      {phase === "work_done" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-center">Session complete 🍅</h2>
            <div>
              <Label>What did you accomplish? (optional)</Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Shipped auth flow, fixed bug..."
                className="mt-1.5"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && void handleSaveAndBreak()}
              />
            </div>
            {taskCompletePrompt && selectedTask && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-2">
                <p className="text-sm text-zinc-300">Mark &ldquo;{selectedTask.title}&rdquo; complete?</p>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1 h-8 text-xs" onClick={() => void handleTaskAction("complete")}>Yes</Button>
                  <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => void handleTaskAction("snooze")}>Snooze</Button>
                  <Button variant="outline" className="flex-1 h-8 text-xs" onClick={() => void handleTaskAction("no")}>No</Button>
                </div>
              </div>
            )}
            <Button variant="primary" className="w-full" onClick={handleSaveAndBreak}>
              Save &amp; start break
            </Button>
          </div>
        </div>
      )}

      {/* Break done overlay */}
      {phase === "break_done" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-zinc-700 bg-zinc-900 p-6 space-y-4 text-center">
            <h2 className="text-lg font-semibold">Break over</h2>
            <p className="text-sm text-zinc-400">Ready for session {sessionNum + 1}?</p>
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1" onClick={handleEndBreakStartWork}>
                Start next session
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => void handleCancel()}>
                Done for now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
