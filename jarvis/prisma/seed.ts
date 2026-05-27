import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { subDays, addDays, startOfDay, format } from "date-fns";
import path from "path";

const dbPath = path.resolve(__dirname, "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

function jitter(base: number, pct = 0.15): number {
  return Math.round((base + (Math.random() - 0.5) * 2 * base * pct) * 10) / 10;
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("Seeding database with 14 days of data...\n");

  // ── Profile ──────────────────────────────────────────────────────────────
  await prisma.userProfile.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  // ── Projects ─────────────────────────────────────────────────────────────
  const projects = await Promise.all([
    prisma.project.create({ data: { name: "SaaS MVP", description: "Building the core product — auth, billing, dashboard", status: "Active", priority: 5, color: "#60a5fa" } }),
    prisma.project.create({ data: { name: "Content Engine", description: "YouTube + blog content for audience building", status: "Active", priority: 3, color: "#34d399" } }),
    prisma.project.create({ data: { name: "Sales Pipeline", description: "Outbound sales and partnership development", status: "Active", priority: 4, color: "#fbbf24" } }),
  ]);

  // ── Habits ────────────────────────────────────────────────────────────────
  const habits = await Promise.all([
    prisma.habit.create({ data: { name: "Morning workout", icon: "dumbbell", color: "#34d399", targetFrequency: "Daily", order: 0 } }),
    prisma.habit.create({ data: { name: "No phone first 30min", icon: "moon", color: "#818cf8", targetFrequency: "Daily", order: 1 } }),
    prisma.habit.create({ data: { name: "Cold shower", icon: "droplets", color: "#60a5fa", targetFrequency: "Daily", order: 2 } }),
    prisma.habit.create({ data: { name: "Read 20 pages", icon: "book", color: "#fbbf24", targetFrequency: "Daily", order: 3 } }),
    prisma.habit.create({ data: { name: "No phone after 10pm", icon: "moon", color: "#f87171", targetFrequency: "Daily", order: 4 } }),
  ]);

  // Habit completion rates (realistic variance)
  const habitRates = [0.85, 0.90, 0.70, 0.65, 0.45]; // last one is the problem habit

  const defaultSupplements = [
    { name: "Creatine", dose: "5g", time: "08:00" },
    { name: "Vitamin D3", dose: "5000 IU", time: "08:00" },
    { name: "Magnesium", dose: "400mg", time: "21:00" },
    { name: "Omega-3", dose: "2g", time: "12:00" },
  ];

  const workoutTypes = ["strength", "cardio", "strength", "mobility", "strength", "cardio", "rest"];

  const expenseCategories = ["Food", "Transport", "Subscriptions", "Entertainment", "Bills", "Shopping", "Health"];
  const incomeSources = ["Client A", "Client B", "SaaS subscription", "Freelance", "Consulting"];

  for (let i = 13; i >= 0; i--) {
    const date = startOfDay(subDays(new Date(), i));
    const dateStr = format(date, "yyyy-MM-dd");
    const dayOfWeek = date.getDay();
    const isRestDay = dayOfWeek === 0;
    const isBadSleepNight = i === 11 || i === 4;
    const highCaffeine = i === 10 || i === 3;
    const lowProteinDay = i === 9 || i === 2;

    // ── Daily Log ────────────────────────────────────────────────────────
    const log = await prisma.dailyLog.upsert({ where: { date }, create: { date }, update: {} });

    // Sleep
    const sleepHours = isBadSleepNight ? jitter(5.5) : jitter(7.4);
    await prisma.sleep.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, hours: sleepHours, quality: isBadSleepNight ? randInt(4, 6) : randInt(6, 9), bedtime: isBadSleepNight ? "01:30" : "22:45", waketime: "06:30" },
      update: {},
    });

    // Workout
    const wType = isRestDay ? "rest" : workoutTypes[i % workoutTypes.length];
    await prisma.workout.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, type: wType, duration: wType === "rest" ? 0 : randInt(45, 70), intensity: wType === "rest" ? 0 : randInt(6, 9), muscleGroups: wType === "rest" ? "" : randItem(["chest, triceps", "back, biceps", "legs, glutes", "shoulders, arms"]) },
      update: {},
    });

    // Stimulants
    await prisma.stimulants.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, caffeineMg: highCaffeine ? jitter(380) : jitter(175), nicotineMg: 0, timeConsumed: highCaffeine ? "07:00, 10:00, 14:30" : "07:00, 12:00" },
      update: {},
    });

    // Macros
    const p = lowProteinDay ? jitter(125) : jitter(172);
    const c = jitter(240);
    const f = jitter(72);
    await prisma.macros.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, protein: p, carbs: c, fats: f, calories: Math.round(p * 4 + c * 4 + f * 9), waterOz: jitter(88), mealCount: randInt(3, 4) },
      update: {},
    });

    // Supplements
    await prisma.supplement.deleteMany({ where: { dailyLogId: log.id } });
    await prisma.supplement.createMany({
      data: defaultSupplements.map((s) => ({ dailyLogId: log.id, ...s, taken: Math.random() > 0.15 })),
    });

    // Health
    const stressDay = isBadSleepNight;
    await prisma.healthMetrics.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, weight: jitter(182, 0.01), mood: stressDay ? randInt(4, 6) : randInt(6, 9), energy: stressDay ? randInt(4, 6) : randInt(6, 9), stress: stressDay ? randInt(6, 9) : randInt(2, 5), focus: stressDay ? randInt(4, 6) : randInt(6, 9) },
      update: {},
    });

    // ── Expenses (2-4 per day) ───────────────────────────────────────────
    const numExpenses = randInt(2, 4);
    for (let e = 0; e < numExpenses; e++) {
      const cat = randItem(expenseCategories);
      const amounts: Record<string, number> = { Food: 25, Transport: 15, Subscriptions: 30, Entertainment: 40, Bills: 80, Shopping: 60, Health: 35 };
      await prisma.expense.create({
        data: { date, amount: jitter(amounts[cat] ?? 30, 0.4), category: cat, description: cat === "Food" ? randItem(["Chipotle", "Grocery run", "Coffee", "Lunch out"]) : null },
      });
    }

    // ── Income (most days, not all) ───────────────────────────────────────
    if (Math.random() > 0.25) {
      await prisma.income.create({
        data: { date, amount: jitter(i % 3 === 0 ? 650 : 280, 0.3), source: randItem(incomeSources), description: null },
      });
    }

    // ── Project logs ─────────────────────────────────────────────────────
    if (!isRestDay) {
      const projectsToLog = Math.random() > 0.4 ? [projects[0], projects[randInt(1, 2)]] : [projects[0]];
      for (const proj of projectsToLog) {
        const wins = {
          [projects[0].id]: ["Shipped auth flow", "Fixed payment bug", "Built dashboard charts", "Wrote onboarding copy", "Set up CI/CD"],
          [projects[1].id]: ["Recorded YouTube video", "Published blog post", "Wrote email sequence", "Created social content"],
          [projects[2].id]: ["Sent 20 cold emails", "Had discovery call", "Built proposal template", "Followed up 5 leads"],
        };
        await prisma.projectLog.create({
          data: {
            projectId: proj.id,
            date,
            hoursWorked: jitter(proj.priority === 5 ? 3.5 : 1.5, 0.2),
            whatWasCompleted: randItem(wins[proj.id] ?? ["Made progress"]),
            blockers: Math.random() > 0.7 ? randItem(["Waiting on API docs", "Unclear requirements", "Low energy day"]) : null,
            nextStep: randItem(["Pick up tomorrow", "Review with team", "Ship by EOW"]),
          },
        });
      }
    }

    // ── Habit completions ─────────────────────────────────────────────────
    for (let h = 0; h < habits.length; h++) {
      if (Math.random() < habitRates[h]) {
        await prisma.habitCompletion.upsert({
          where: { habitId_date: { habitId: habits[h].id, date } },
          create: { habitId: habits[h].id, date, completed: true },
          update: {},
        });
      }
    }

    // ── Pre-computed scores ───────────────────────────────────────────────
    const sleepScore = sleepHours >= 8 ? 92 : sleepHours >= 7 ? 80 : sleepHours >= 6 ? 62 : 40;
    const workoutScore = wType === "rest" ? 65 : jitter(80);
    const stimScore = highCaffeine ? 45 : 88;
    const macroScore = lowProteinDay ? 60 : jitter(82);
    const supScore = jitter(84);
    const expenses = await prisma.expense.findMany({ where: { date: { gte: date, lte: new Date(date.getTime() + 86399999) } } });
    const incomeRows = await prisma.income.findMany({ where: { date: { gte: date, lte: new Date(date.getTime() + 86399999) } } });
    const net = incomeRows.reduce((s, r) => s + r.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0);
    const finScore = net > 0 ? jitter(82) : jitter(48);
    const healthScore = stressDay ? 55 : jitter(76);
    const projHours = isRestDay ? 0 : jitter(5);
    const entScore = projHours >= 4 ? jitter(85) : projHours >= 2 ? jitter(65) : 45;
    const habitsCompleted = habits.filter((_, hi) => Math.random() < habitRates[hi]).length;
    const habitScore = Math.round((habitsCompleted / habits.length) * 100);
    const scores = [sleepScore, workoutScore, stimScore, macroScore, supScore, finScore, healthScore, entScore, habitScore];
    const overall = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    await prisma.dailyScore.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        sleepScore, workoutScore, stimulantsScore: stimScore, macrosScore: macroScore,
        supplementsScore: supScore, financesScore: finScore, healthScore, entrepreneurialScore: entScore,
        habitScore, overallScore: overall,
        recommendation: i === 0
          ? `You've averaged ${sleepHours.toFixed(1)}h sleep — below your 8h target. Your 'No phone after 10pm' habit is at ${Math.round(habitRates[4] * 100)}% over 30 days and is directly correlated with your late bedtimes. SaaS MVP has the most hours this week; Sales Pipeline hasn't been touched in 2 days.`
          : null,
        priorityAction: i === 0
          ? sleepHours < 7 ? "Set a hard 10:30pm screen-off alarm tonight. This single habit fixes your sleep, which cascades into energy and focus."
          : "Log a Sales Pipeline entry today — it's your highest-leverage revenue activity and you've skipped it 2 days running."
          : null,
        warnings: i === 0 && highCaffeine
          ? JSON.stringify(["Caffeine at 2:30pm (380mg total) likely cut 45-60min of deep sleep. Keep it under 200mg and before 1pm."])
          : JSON.stringify([]),
        dataHash: "seed",
      },
      update: {},
    });

    console.log(`  ✓ Day ${14 - i} seeded (${dateStr}) — sleep: ${sleepHours}h, score: ${overall}`);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const today = startOfDay(new Date());
  const taskData = [
    // Overdue tasks
    { title: "Finish Q4 investor proposal", priority: 1, status: "Pending", dueDate: subDays(today, 3), projectId: projects[0].id, estimatedMinutes: 120, description: "Deck + financial projections for seed round" },
    { title: "Fix checkout bug on mobile", priority: 1, status: "Pending", dueDate: subDays(today, 1), projectId: projects[0].id, estimatedMinutes: 60, description: "Stripe webhook not firing on iOS Safari" },
    // Due today
    { title: "Record intro video for YouTube channel", priority: 2, status: "Pending", dueDate: today, projectId: projects[1].id, estimatedMinutes: 90 },
    // InProgress
    { title: "Build onboarding email sequence", priority: 2, status: "InProgress", dueDate: addDays(today, 2), projectId: projects[0].id, estimatedMinutes: 180 },
    { title: "Cold outreach — 20 leads this week", priority: 2, status: "InProgress", dueDate: addDays(today, 4), projectId: projects[2].id, estimatedMinutes: 60 },
    // Upcoming pending
    { title: "Set up CI/CD pipeline", priority: 3, status: "Pending", dueDate: addDays(today, 3), projectId: projects[0].id, estimatedMinutes: 90 },
    { title: "Write blog post: how I built the MVP in 4 weeks", priority: 3, status: "Pending", dueDate: addDays(today, 5), projectId: projects[1].id, estimatedMinutes: 120 },
    { title: "Book accountant for tax review", priority: 3, status: "Pending", dueDate: addDays(today, 7), estimatedMinutes: 30 },
    { title: "Update pricing page copy", priority: 4, status: "Pending", dueDate: addDays(today, 10), projectId: projects[0].id, estimatedMinutes: 45 },
    { title: "Research podcast outreach strategy", priority: 4, status: "Pending", projectId: projects[1].id, estimatedMinutes: 60 },
    // Backlog
    { title: "Refactor auth module", priority: 5, status: "Pending", projectId: projects[0].id, estimatedMinutes: 120 },
    { title: "Explore affiliate program ideas", priority: 5, status: "Pending", estimatedMinutes: 45 },
    // Completed
    { title: "Set up Stripe billing", priority: 1, status: "Completed", projectId: projects[0].id, completedAt: subDays(today, 2) },
    { title: "Launch landing page", priority: 2, status: "Completed", projectId: projects[0].id, completedAt: subDays(today, 5) },
  ];

  for (let i = 0; i < taskData.length; i++) {
    const t = taskData[i];
    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description ?? null,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate ?? null,
        projectId: t.projectId ?? null,
        estimatedMinutes: t.estimatedMinutes ?? null,
        completedAt: t.completedAt ?? null,
        order: i,
      },
    });
  }
  console.log(`   - ${taskData.length} tasks seeded (2 overdue, 1 due today, mix of priorities)`);

  console.log("\n✅ Seed complete:");
  console.log(`   - 14 daily logs`);
  console.log(`   - ${projects.length} projects with logs`);
  console.log(`   - ${habits.length} habits with completion history`);
  console.log(`   - Finance transactions (expenses + income) for each day`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
