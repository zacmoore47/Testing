"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Plus, ExternalLink } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { TaskRow, PRIORITY_LABELS, PRIORITY_COLORS, ProjectRow } from "@/types";
import { format, isPast, isWithinInterval, addDays, parseISO } from "date-fns";

interface Props {
  initialTasks?: TaskRow[];
}

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[priority]}`}>
      P{priority}
    </span>
  );
}

function DueDateLabel({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return null;
  const d = parseISO(dueDate);
  const overdue = isPast(d) && format(d, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");
  const soon = isWithinInterval(d, { start: new Date(), end: addDays(new Date(), 7) });
  if (!soon && !overdue) return null;
  return (
    <span className={`text-[10px] font-medium ${overdue ? "text-red-400" : "text-orange-400"}`}>
      {overdue ? "Overdue" : format(d, "MMM d")}
    </span>
  );
}

export function PriorityTasksWidget({ initialTasks = [] }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>(initialTasks);
  const [projects, setProjects] = useState<Pick<ProjectRow, "id" | "name">[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("3");
  const [projectId, setProjectId] = useState<string>("none");
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<Set<number>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks?status=Pending&limit=5");
    if (res.ok) setTasks(await res.json());
  }, []);

  useEffect(() => {
    if (initialTasks.length === 0) fetchTasks();
    fetch("/api/projects").then((r) => r.json()).then((p: ProjectRow[]) =>
      setProjects(p.map((x) => ({ id: x.id, name: x.name })))
    ).catch(() => {});
  }, [initialTasks.length, fetchTasks]);

  async function handleAdd() {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority: parseInt(priority),
          projectId: projectId !== "none" ? parseInt(projectId) : null,
        }),
      });
      if (!res.ok) throw new Error();
      setTitle("");
      setPriority("3");
      setProjectId("none");
      await fetchTasks();
      toast.success("Task added");
      inputRef.current?.focus();
    } catch {
      toast.error("Failed to add task");
    } finally {
      setAdding(false);
    }
  }

  async function handleComplete(id: number) {
    setCompleting((s) => new Set(s).add(id));
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      });
      // Animate out then remove
      setTimeout(async () => {
        setCompleting((s) => { const n = new Set(s); n.delete(id); return n; });
        await fetchTasks();
      }, 500);
    } catch {
      setCompleting((s) => { const n = new Set(s); n.delete(id); return n; });
      toast.error("Failed to update task");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Priority Tasks</h2>
        <Link href="/tasks" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          View all <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Add bar */}
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && void handleAdd()}
              placeholder="New task..."
              className="flex-1 h-8 text-sm"
            />
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((p) => (
                  <SelectItem key={p} value={String(p)} className="text-xs">
                    P{p} — {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length > 0 && (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue placeholder="Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="primary"
              className="h-8 px-3 gap-1.5 text-xs"
              onClick={handleAdd}
              disabled={adding || !title.trim()}
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>

          {/* Task list */}
          {tasks.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">No pending tasks — you&apos;re clear.</p>
          ) : (
            <ul className="space-y-1.5">
              {tasks.map((task) => {
                const done = completing.has(task.id);
                return (
                  <li
                    key={task.id}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 bg-zinc-800/50 border border-zinc-700/50 transition-all duration-500 ${done ? "opacity-0 scale-95" : "opacity-100"}`}
                  >
                    <button
                      onClick={() => void handleComplete(task.id)}
                      className="shrink-0 text-zinc-500 hover:text-green-400 transition-colors"
                      disabled={done}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <PriorityBadge priority={task.priority} />
                    <span className={`flex-1 text-sm text-zinc-200 transition-all ${done ? "line-through text-zinc-500" : ""}`}>
                      {task.title}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.projectName && (
                        <Badge className="text-[10px] py-0 px-1.5 border border-zinc-600 text-zinc-500 bg-transparent rounded">
                          {task.projectName}
                        </Badge>
                      )}
                      <DueDateLabel dueDate={task.dueDate} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
