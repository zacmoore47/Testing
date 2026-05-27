-- CreateTable
CREATE TABLE "UserProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "targetSleepHours" REAL NOT NULL DEFAULT 8,
    "targetBedtime" TEXT NOT NULL DEFAULT '22:30',
    "targetWaketime" TEXT NOT NULL DEFAULT '06:30',
    "targetWorkoutsPerWeek" INTEGER NOT NULL DEFAULT 5,
    "targetCaloriesBurned" REAL NOT NULL DEFAULT 500,
    "targetProtein" REAL NOT NULL DEFAULT 180,
    "targetCarbs" REAL NOT NULL DEFAULT 250,
    "targetFats" REAL NOT NULL DEFAULT 70,
    "targetCalories" REAL NOT NULL DEFAULT 2400,
    "targetWater" REAL NOT NULL DEFAULT 100,
    "targetDailyIncome" REAL NOT NULL DEFAULT 500,
    "targetMonthlySavings" REAL NOT NULL DEFAULT 3000,
    "targetWeight" REAL NOT NULL DEFAULT 180,
    "targetDeepWorkHours" REAL NOT NULL DEFAULT 4,
    "targetRevenueHoursPerDay" REAL NOT NULL DEFAULT 3,
    "maxCaffeineMg" REAL NOT NULL DEFAULT 200,
    "overallGoals" TEXT NOT NULL DEFAULT 'Optimize performance across all life sectors. Build a successful business while maintaining peak physical and mental health.'
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Sleep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "hours" REAL NOT NULL,
    "quality" INTEGER NOT NULL,
    "bedtime" TEXT NOT NULL,
    "waketime" TEXT NOT NULL,
    "remPct" REAL,
    "deepPct" REAL,
    "hrv" REAL,
    "restingHr" INTEGER,
    "notes" TEXT,
    CONSTRAINT "Sleep_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "intensity" INTEGER NOT NULL,
    "caloriesBurned" REAL,
    "muscleGroups" TEXT,
    "notes" TEXT,
    CONSTRAINT "Workout_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stimulants" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "caffeineMg" REAL NOT NULL DEFAULT 0,
    "nicotineMg" REAL NOT NULL DEFAULT 0,
    "other" TEXT,
    "timeConsumed" TEXT,
    "notes" TEXT,
    CONSTRAINT "Stimulants_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Macros" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "protein" REAL NOT NULL,
    "carbs" REAL NOT NULL,
    "fats" REAL NOT NULL,
    "calories" REAL NOT NULL,
    "waterOz" REAL NOT NULL DEFAULT 0,
    "mealCount" INTEGER NOT NULL DEFAULT 3,
    "notes" TEXT,
    CONSTRAINT "Macros_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Supplement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "time" TEXT,
    "taken" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Supplement_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "income" REAL NOT NULL DEFAULT 0,
    "spend" REAL NOT NULL DEFAULT 0,
    "categories" TEXT,
    "netForDay" REAL NOT NULL DEFAULT 0,
    "runningMonthlyNet" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    CONSTRAINT "Finances_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HealthMetrics" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "weight" REAL,
    "bodyFatPct" REAL,
    "mood" INTEGER,
    "energy" INTEGER,
    "stress" INTEGER,
    "focus" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "glucose" REAL,
    "notes" TEXT,
    CONSTRAINT "HealthMetrics_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entrepreneurial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "deepWorkHours" REAL NOT NULL DEFAULT 0,
    "revenueActivityHours" REAL NOT NULL DEFAULT 0,
    "keyWins" TEXT,
    "blockers" TEXT,
    "projectTags" TEXT,
    "notes" TEXT,
    CONSTRAINT "Entrepreneurial_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyScore" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyLogId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sleepScore" REAL NOT NULL DEFAULT 0,
    "workoutScore" REAL NOT NULL DEFAULT 0,
    "stimulantsScore" REAL NOT NULL DEFAULT 0,
    "macrosScore" REAL NOT NULL DEFAULT 0,
    "supplementsScore" REAL NOT NULL DEFAULT 0,
    "financesScore" REAL NOT NULL DEFAULT 0,
    "healthScore" REAL NOT NULL DEFAULT 0,
    "entrepreneurialScore" REAL NOT NULL DEFAULT 0,
    "overallScore" REAL NOT NULL DEFAULT 0,
    "recommendation" TEXT,
    "priorityAction" TEXT,
    "warnings" TEXT,
    "dataHash" TEXT,
    CONSTRAINT "DailyScore_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "DailyLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_date_key" ON "DailyLog"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Sleep_dailyLogId_key" ON "Sleep"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_dailyLogId_key" ON "Workout"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Stimulants_dailyLogId_key" ON "Stimulants"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Macros_dailyLogId_key" ON "Macros"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Finances_dailyLogId_key" ON "Finances"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMetrics_dailyLogId_key" ON "HealthMetrics"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "Entrepreneurial_dailyLogId_key" ON "Entrepreneurial"("dailyLogId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyScore_dailyLogId_key" ON "DailyScore"("dailyLogId");
