"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProjectRow, ProjectStatus } from "@/types";
import { parseISO, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { Plus, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<ProjectStatus, string> = {
  Active: "green", Paused: "yellow", Completed: "blue", Archived: "default",
};

const PROJECT_COLORS = ["#60a5fa","#34d399","#f87171","#fbbf24","#a78bfa","#fb923c","#e879f9","#67e8f9"];

function NewProjectModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("3");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, priority: parseInt(priority), color }),
      });
      toast.success("Project created");
      onSave();
      onClose();
    } catch {
      toast.error("Failed to create project");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
        <h3 className="text-base font-semibold mb-4">New Project</h3>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" autoFocus /></div>
          <div>
            <Label>Description</Label>
            <textarea
              className="mt-1 flex min-h-[60px] w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
              placeholder="What is this project about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["5","🔴 Critical"],["4","🟠 High"],["3","🟡 Medium"],["2","🟢 Low"],["1","⚪ Minimal"]].map(([v,l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-1.5">
              {PROJECT_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} className={`w-6 h-6 rounded-full transition-transform ${color === c ? "scale-125 ring-2 ring-white/30" : ""}`} style={{ background: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function totalHours(project: ProjectRow): number {
  return project.logs.reduce((s, l) => s + l.hoursWorked, 0);
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState<string>("Active");

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "All" ? projects : projects.filter((p) => p.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button variant="primary" onClick={() => setShowModal(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New project
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 w-fit">
        {["Active","Paused","Completed","Archived","All"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${filter === s ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card className="py-16 text-center">
          <CardContent>
            <p className="text-zinc-500 mb-4">No {filter.toLowerCase()} projects.</p>
            {filter === "Active" && (
              <Button variant="primary" onClick={() => setShowModal(true)}>Create your first project</Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all cursor-pointer space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
                  <h3 className="font-semibold text-zinc-100 text-sm">{project.name}</h3>
                </div>
                <Badge variant={STATUS_COLORS[project.status as ProjectStatus] as "green" | "yellow" | "blue" | "default"}>
                  {project.status}
                </Badge>
              </div>

              {project.description && (
                <p className="text-xs text-zinc-500 line-clamp-2">{project.description}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {totalHours(project).toFixed(1)}h total
                </span>
                {project.logs[0] && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDistanceToNow(parseISO(project.logs[0].date), { addSuffix: true })}
                  </span>
                )}
                <span className="ml-auto">P{project.priority}</span>
              </div>

              {project.logs[0] && (
                <p className="text-xs text-zinc-400 bg-zinc-800 rounded-md px-2 py-1.5 line-clamp-2">
                  &ldquo;{project.logs[0].whatWasCompleted}&rdquo;
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      {showModal && <NewProjectModal onClose={() => setShowModal(false)} onSave={load} />}
    </div>
  );
}
