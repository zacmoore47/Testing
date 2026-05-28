// ─── Sector names ─────────────────────────────────────────────────────────

export type SectorName =
  | "sleep"
  | "workout"
  | "stimulants"
  | "macros"
  | "supplements"
  | "finances"
  | "health"
  | "entrepreneurial"
  | "habits";

// ─── AI Analysis ──────────────────────────────────────────────────────────

export interface SectorScores {
  sleep: number;
  workout: number;
  stimulants: number;
  macros: number;
  supplements: number;
  finances: number;
  health: number;
  entrepreneurial: number;
  habits: number;
}

export interface AIAnalysis {
  scores: SectorScores;
  overall: number;
  recommendation: string;
  priorityAction: string;
  warnings: string[];
  topTaskRecommendation?: string;
}

// ─── Daily Log Input ──────────────────────────────────────────────────────

export interface DailyLogInput {
  date: string;

  sleep?: {
    hours: number;
    quality: number;
    bedtime: string;
    waketime: string;
    notes?: string;
  };

  workout?: {
    type: string;
    duration: number;
    intensity: number;
    muscleGroups?: string;
    notes?: string;
  };

  stimulants?: {
    caffeineMg: number;
    nicotineMg: number;
    other?: string;
    timeConsumed?: string;
    notes?: string;
  };

  macros?: {
    protein: number;
    carbs: number;
    fats: number;
    calories: number;
    waterOz: number;
    mealCount: number;
    notes?: string;
  };

  supplements?: Array<{
    name: string;
    dose: string;
    time?: string;
    taken: boolean;
  }>;

  healthMetrics?: {
    weight?: number;
    bodyFatPct?: number;
    mood?: number;
    energy?: number;
    stress?: number;
    focus?: number;
    systolic?: number;
    diastolic?: number;
    glucose?: number;
    notes?: string;
  };
}

// ─── Finance ──────────────────────────────────────────────────────────────

export const EXPENSE_CATEGORIES = [
  "Food",
  "Transport",
  "Subscriptions",
  "Entertainment",
  "Bills",
  "Shopping",
  "Health",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseRow {
  id: number;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  createdAt: string;
}

export interface IncomeRow {
  id: number;
  date: string;
  amount: number;
  source: string;
  description: string | null;
  createdAt: string;
}

export interface DailyFinanceSummary {
  date: string;
  totalExpenses: number;
  totalIncome: number;
  net: number;
  expensesByCategory: Record<string, number>;
}

// ─── Projects ─────────────────────────────────────────────────────────────

export type ProjectStatus = "Active" | "Paused" | "Completed" | "Archived";

export interface ProjectRow {
  id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: number;
  color: string;
  targetCompletionDate: string | null;
  createdAt: string;
  logs: ProjectLogRow[];
}

export interface ProjectLogRow {
  id: number;
  projectId: number;
  date: string;
  hoursWorked: number;
  whatWasCompleted: string;
  blockers: string | null;
  nextStep: string | null;
  createdAt: string;
}

export interface ProjectLogInput {
  projectId: number;
  date: string;
  hoursWorked: number;
  whatWasCompleted: string;
  blockers?: string;
  nextStep?: string;
}

// ─── Habits ───────────────────────────────────────────────────────────────

export type HabitFrequency = "Daily" | "Weekdays" | string;

export interface HabitRow {
  id: number;
  name: string;
  icon: string;
  color: string;
  targetFrequency: HabitFrequency;
  active: boolean;
  order: number;
  createdAt: string;
  completions: HabitCompletionRow[];
}

export interface HabitCompletionRow {
  id: number;
  habitId: number;
  date: string;
  completed: boolean;
  createdAt: string;
}

// ─── Tasks ────────────────────────────────────────────────────────────────

export type TaskStatus = "Pending" | "InProgress" | "Completed" | "Cancelled";

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Medium",
  4: "Low",
  5: "Backlog",
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-500/20 text-red-400 border-red-500/30",
  2: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  4: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  5: "bg-zinc-700/50 text-zinc-400 border-zinc-600",
};

export interface TaskRow {
  id: number;
  title: string;
  description: string | null;
  priority: number;
  status: TaskStatus;
  dueDate: string | null;
  projectId: number | null;
  projectName?: string | null;
  estimatedMinutes: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: number;
}

// ─── Focus Sessions ───────────────────────────────────────────────────────

export type FocusSessionType = "Work" | "ShortBreak" | "LongBreak";

export interface FocusSessionRow {
  id: number;
  projectId: number | null;
  taskId: number | null;
  startedAt: string;
  endedAt: string | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  sessionType: FocusSessionType;
  completed: boolean;
  notes: string | null;
  createdAt: string;
  project?: { name: string } | null;
  task?: { title: string } | null;
}

// ─── Dashboard cards ──────────────────────────────────────────────────────

export interface SparklineData {
  date: string;
  value: number;
}

export interface SectorCardData {
  name: SectorName;
  label: string;
  score: number;
  sparkline: SparklineData[];
  topMetric: string;
  topMetricValue: string;
  icon?: string;
}
