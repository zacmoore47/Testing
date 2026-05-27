"use client";
import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2, Trash2, Search, GripVertical, Plus, X
} from "lucide-react";
import { toast } from "sonner";
import { TaskRow, TaskStatus, PRIORITY_LABELS, PRIORITY_COLORS, ProjectRow } from "@/types";
import { format, isPast, parseISO, subDays, startOfDay } from "date-fns";

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "Pending", label: "Pending", color: "border-zinc-700" },
  { status: "InProgress", label: "In Progress", color: "border-blue-500/40" },
  { status: "Completed", label: "Completed", color: "border-green-500/40" },
];

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[priority]}`}>
      P{priority} {PRIORITY_LABELS[priority]}
    </span>
  );
}

interface TaskCardProps {
  task: TaskRow;
  onComplete: (id: number) => void;
  onDelete: (id: number) => void;
  isDragging?: boolean;
  selected?: boolean;
  onSelect?: (id: number) => void;
}

function TaskCard({ task, onComplete, onDelete, isDragging, selected, onSelect }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: task.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const overdue = task.dueDate && isPast(parseISO(task.dueDate)) &&
    format(parseISO(task.dueDate), "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg border bg-zinc-900 p-3 space-y-2 cursor-default select-none transition-shadow ${
        selected ? "border-blue-500/60 shadow-blue-500/10 shadow-md" : "border-zinc-700/60"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <input
          type="checkbox"
          checked={selected ?? false}
          onChange={() => onSelect?.(task.id)}
          className="mt-1 shrink-0 accent-blue-500 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${task.status === "Completed" ? "line-through text-zinc-500" : "text-zinc-200"}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{task.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {task.status !== "Completed" && (
            <button
              onClick={() => onComplete(task.id)}
              className="p-1 text-zinc-500 hover:text-green-400 transition-colors"
              title="Mark complete"
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 pl-10 flex-wrap">
        <PriorityBadge priority={task.priority} />
        {task.projectName && (
          <Badge className="text-[10px] py-0 px-1.5 border border-zinc-600 text-zinc-400 bg-transparent rounded">
            {task.projectName}
          </Badge>
        )}
        {task.dueDate && (
          <span className={`text-[10px] font-medium ${overdue ? "text-red-400" : "text-zinc-500"}`}>
            {overdue ? "⚠ " : ""}{format(parseISO(task.dueDate), "MMM d")}
          </span>
        )}
        {task.estimatedMinutes && (
          <span className="text-[10px] text-zinc-600">{task.estimatedMinutes}min</span>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projects, setProjects] = useState<Pick<ProjectRow, "id" | "name">[]>([]);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"priority" | "dueDate" | "createdAt">("priority");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);

  // New task form
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("3");
  const [newProject, setNewProject] = useState<string>("none");
  const [newDue, setNewDue] = useState("");
  const [adding, setAdding] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const fetchTasks = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
  }, []);

  useEffect(() => {
    fetchTasks();
    fetch("/api/projects")
      .then((r) => r.json())
      .then((p: ProjectRow[]) => setProjects(p.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, [fetchTasks]);

  const completedCutoff = startOfDay(subDays(new Date(), 7)).toISOString();

  function getColumnTasks(status: TaskStatus): TaskRow[] {
    return tasks
      .filter((t) => {
        if (status === "Completed") {
          return t.status === "Completed" && t.completedAt && t.completedAt >= completedCutoff;
        }
        return t.status === status;
      })
      .filter((t) => !search || t.title.toLowerCase().includes(search.toLowerCase()))
      .filter((t) => filterPriority === "all" || t.priority === parseInt(filterPriority))
      .filter((t) => filterProject === "all" || t.projectId === parseInt(filterProject))
      .sort((a, b) => {
        if (sortBy === "priority") return a.priority - b.priority || a.order - b.order;
        if (sortBy === "dueDate") {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
  }

  async function handleComplete(id: number) {
    await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Completed" }),
    });
    await fetchTasks();
    toast.success("Task completed");
  }

  async function handleDelete(id: number) {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast.success("Task deleted");
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          priority: parseInt(newPriority),
          projectId: newProject !== "none" ? parseInt(newProject) : null,
          dueDate: newDue || null,
        }),
      });
      setNewTitle("");
      setNewDue("");
      await fetchTasks();
      toast.success("Task created");
    } catch {
      toast.error("Failed to create task");
    } finally {
      setAdding(false);
    }
  }

  async function bulkComplete() {
    await Promise.all(Array.from(selected).map((id) =>
      fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Completed" }),
      })
    ));
    setSelected(new Set());
    await fetchTasks();
    toast.success(`${selected.size} tasks completed`);
  }

  async function bulkDelete() {
    await Promise.all(Array.from(selected).map((id) =>
      fetch(`/api/tasks/${id}`, { method: "DELETE" })
    ));
    setSelected(new Set());
    setTasks((prev) => prev.filter((t) => !selected.has(t.id)));
    toast.success(`${selected.size} tasks deleted`);
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  async function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const overId = over.id as string;
    const newStatus = COLUMNS.find((c) => c.status === overId)?.status;
    if (!newStatus) return;
    const taskId = active.id as number;
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const overId = over.id as string;
    const newStatus = COLUMNS.find((c) => c.status === overId)?.status;
    if (!newStatus) return;
    const taskId = active.id as number;
    await fetch(`/api/tasks/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchTasks();
  }

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tasks</h1>

      {/* Filters + Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All priorities</SelectItem>
            {[1, 2, 3, 4, 5].map((p) => (
              <SelectItem key={p} value={String(p)} className="text-xs">P{p} — {PRIORITY_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {projects.length > 0 && (
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="priority" className="text-xs">Sort: Priority</SelectItem>
            <SelectItem value="dueDate" className="text-xs">Sort: Due date</SelectItem>
            <SelectItem value="createdAt" className="text-xs">Sort: Created</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
          <span className="text-sm text-zinc-300">{selected.size} selected</span>
          <Button variant="outline" className="h-7 text-xs gap-1" onClick={bulkComplete}>
            <CheckCircle2 className="h-3 w-3" /> Complete
          </Button>
          <Button variant="outline" className="h-7 text-xs gap-1 text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={bulkDelete}>
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add task form */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !adding && void handleAdd()}
              placeholder="New task title..."
              className="flex-1 min-w-48 h-8 text-sm"
            />
            <Select value={newPriority} onValueChange={setNewPriority}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((p) => (
                  <SelectItem key={p} value={String(p)} className="text-xs">P{p} — {PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projects.length > 0 && (
              <Select value={newProject} onValueChange={setNewProject}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)} className="text-xs">{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="w-36 h-8 text-xs"
            />
            <Button variant="primary" className="h-8 px-3 gap-1.5 text-xs" onClick={handleAdd} disabled={adding || !newTitle.trim()}>
              <Plus className="h-3.5 w-3.5" /> Add task
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Kanban */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = getColumnTasks(col.status);
            return (
              <div key={col.status} id={col.status}>
                <Card className={`border-t-2 ${col.color}`}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm font-semibold flex items-center justify-between">
                      {col.label}
                      <Badge className="text-xs border border-zinc-700 text-zinc-500 bg-transparent rounded-full">
                        {colTasks.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-2 min-h-24">
                    <SortableContext items={colTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {colTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onComplete={handleComplete}
                          onDelete={handleDelete}
                          isDragging={activeId === task.id}
                          selected={selected.has(task.id)}
                          onSelect={toggleSelect}
                        />
                      ))}
                    </SortableContext>
                    {colTasks.length === 0 && (
                      <p className="text-xs text-zinc-600 text-center py-6">Empty</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeTask && (
            <div className="rounded-lg border border-blue-500/40 bg-zinc-900 p-3 shadow-2xl opacity-90 rotate-1">
              <p className="text-sm text-zinc-200">{activeTask.title}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
