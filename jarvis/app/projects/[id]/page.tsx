"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TrendChart } from "@/components/charts/TrendChart";
import { ProjectRow, ProjectLogRow, ProjectStatus } from "@/types";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Plus, Trash2, ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useParams } from "next/navigation";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  Active: "green", Paused: "yellow", Completed: "blue", Archived: "default",
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [logs, setLogs] = useState<ProjectLogRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  // New log form state
  const [hours, setHours] = useState("");
  const [completed, setCompleted] = useState("");
  const [blockers, setBlockers] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [logDate, setLogDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [projRes, logsRes] = await Promise.all([
      fetch(`/api/projects`).then((r) => r.json()),
      fetch(`/api/project-logs?projectId=${id}`).then((r) => r.json()),
    ]);
    const proj = projRes.find((p: ProjectRow) => p.id === parseInt(id as string));
    setProject(proj ?? null);
    setLogs(logsRes);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAddLog() {
    if (!completed || !hours) { toast.error("Hours and completion notes are required"); return; }
    setSaving(true);
    try {
      await fetch("/api/project-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: parseInt(id as string),
          date: logDate,
          hoursWorked: parseFloat(hours),
          whatWasCompleted: completed,
          blockers: blockers || undefined,
          nextStep: nextStep || undefined,
        }),
      });
      setHours(""); setCompleted(""); setBlockers(""); setNextStep("");
      setShowForm(false);
      await load();
      toast.success("Log entry added");
    } catch {
      toast.error("Failed to save log");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLog(logId: number) {
    await fetch(`/api/project-logs?id=${logId}`, { method: "DELETE" });
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    toast.success("Entry deleted");
  }

  async function updateStatus(status: string) {
    await fetch("/api/projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: parseInt(id as string), status }),
    });
    setProject((p) => p ? { ...p, status: status as ProjectStatus } : p);
    toast.success(`Status → ${status}`);
  }

  if (!project) return <div className="text-zinc-500 py-12 text-center">Loading...</div>;

  const totalHrs = logs.reduce((s, l) => s + l.hoursWorked, 0);
  const thisWeekHrs = logs.filter((l) => {
    const d = parseISO(l.date);
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }).reduce((s, l) => s + l.hoursWorked, 0);

  const chartData = [...logs].reverse().map((l) => ({
    date: format(parseISO(l.date), "yyyy-MM-dd"),
    value: l.hoursWorked,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/projects" className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300 mb-3">
          <ArrowLeft className="h-3.5 w-3.5" /> Projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full shrink-0" style={{ background: project.color }} />
            <div>
              <h1 className="text-2xl font-bold">{project.name}</h1>
              {project.description && <p className="text-sm text-zinc-400 mt-0.5">{project.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={STATUS_COLORS[project.status] as "green" | "yellow" | "blue" | "default"}>{project.status}</Badge>
            <select
              value={project.status}
              onChange={(e) => updateStatus(e.target.value)}
              className="text-xs rounded-md border border-zinc-700 bg-zinc-800 text-zinc-300 px-2 py-1"
            >
              {["Active","Paused","Completed","Archived"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="text-center p-4">
          <div className="text-xs text-zinc-500 mb-1">Total hours</div>
          <div className="text-2xl font-bold text-zinc-100">{totalHrs.toFixed(1)}</div>
        </Card>
        <Card className="text-center p-4">
          <div className="text-xs text-zinc-500 mb-1">This week</div>
          <div className="text-2xl font-bold text-blue-400">{thisWeekHrs.toFixed(1)}</div>
        </Card>
        <Card className="text-center p-4">
          <div className="text-xs text-zinc-500 mb-1">Log entries</div>
          <div className="text-2xl font-bold text-zinc-100">{logs.length}</div>
        </Card>
      </div>

      {/* Trend chart */}
      {chartData.length > 1 && (
        <Card>
          <CardHeader><CardTitle>Hours per session</CardTitle></CardHeader>
          <CardContent>
            <TrendChart data={chartData} color={project.color} label="Hours" domain={[0, 12]} />
          </CardContent>
        </Card>
      )}

      {/* Add log entry */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Log entries</CardTitle>
            <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)} className="gap-1">
              <Plus className="h-4 w-4" /> Add entry
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <div className="rounded-lg border border-zinc-700 p-4 space-y-3 bg-zinc-800/50">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Date</Label><Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} /></div>
                <div><Label>Hours worked</Label><Input type="number" step="0.25" placeholder="2.5" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
              </div>
              <div>
                <Label>What was completed <span className="text-red-400">*</span></Label>
                <textarea
                  className="mt-1 flex min-h-[70px] w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                  placeholder="Shipped the auth flow, fixed 3 bugs..."
                  value={completed}
                  onChange={(e) => setCompleted(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Blockers</Label><Input placeholder="Optional" value={blockers} onChange={(e) => setBlockers(e.target.value)} /></div>
                <div><Label>Next step</Label><Input placeholder="Optional" value={nextStep} onChange={(e) => setNextStep(e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleAddLog} disabled={saving}>{saving ? "Saving..." : "Save entry"}</Button>
              </div>
            </div>
          )}

          {/* Log history */}
          <div className="space-y-3">
            {logs.length === 0 && <p className="text-zinc-500 text-sm text-center py-4">No log entries yet.</p>}
            {logs.map((log) => (
              <div key={log.id} className="rounded-lg border border-zinc-800 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-zinc-300">{format(parseISO(log.date), "MMM d, yyyy")}</span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500"><Clock className="h-3 w-3" />{log.hoursWorked}h</span>
                    <span className="text-xs text-zinc-600">{formatDistanceToNow(parseISO(log.createdAt), { addSuffix: true })}</span>
                  </div>
                  <button onClick={() => handleDeleteLog(log.id)} className="text-zinc-700 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-sm text-zinc-300">{log.whatWasCompleted}</p>
                {log.blockers && <p className="text-xs text-yellow-400/80">⚠ {log.blockers}</p>}
                {log.nextStep && <p className="text-xs text-blue-400/80">→ {log.nextStep}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
