export interface SectorScores {
  sleep: number;
  workout: number;
  stimulants: number;
  macros: number;
  supplements: number;
  finances: number;
  health: number;
  entrepreneurial: number;
}

export interface AIAnalysis {
  scores: SectorScores;
  overall: number;
  recommendation: string;
  priorityAction: string;
  warnings: string[];
}

export type SectorName =
  | "sleep"
  | "workout"
  | "stimulants"
  | "macros"
  | "supplements"
  | "finances"
  | "health"
  | "entrepreneurial";

export interface DailyLogInput {
  date: string; // ISO date string

  sleep?: {
    hours: number;
    quality: number;
    bedtime: string;
    waketime: string;
    remPct?: number;
    deepPct?: number;
    hrv?: number;
    restingHr?: number;
    notes?: string;
  };

  workout?: {
    type: string;
    duration: number;
    intensity: number;
    caloriesBurned?: number;
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

  finances?: {
    income: number;
    spend: number;
    categories?: string;
    netForDay: number;
    runningMonthlyNet: number;
    notes?: string;
  };

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

  entrepreneurial?: {
    tasksCompleted: number;
    deepWorkHours: number;
    revenueActivityHours: number;
    keyWins?: string;
    blockers?: string;
    projectTags?: string;
    notes?: string;
  };
}

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
