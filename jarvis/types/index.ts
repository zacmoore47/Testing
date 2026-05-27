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
