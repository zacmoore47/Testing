import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { subDays, startOfDay } from "date-fns";
import path from "path";

const dbPath = path.resolve(__dirname, "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

// Realistic variance helper
function jitter(base: number, pct: number = 0.15): number {
  return Math.round((base + (Math.random() - 0.5) * 2 * base * pct) * 10) / 10;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  console.log("Seeding database with 14 days of data...");

  // Ensure profile exists
  await prisma.userProfile.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  const defaultSupplements = [
    { name: "Creatine", dose: "5g", time: "08:00" },
    { name: "Vitamin D3", dose: "5000 IU", time: "08:00" },
    { name: "Magnesium", dose: "400mg", time: "21:00" },
    { name: "Omega-3", dose: "2g", time: "12:00" },
  ];

  const workoutTypes = ["strength", "cardio", "strength", "mobility", "strength", "cardio", "rest"];
  const muscleSets = [
    "chest, triceps, shoulders",
    "back, biceps",
    "legs, glutes",
    "chest, triceps",
    "back, biceps, core",
  ];

  for (let i = 13; i >= 0; i--) {
    const date = startOfDay(subDays(new Date(), i));
    const dayOfWeek = date.getDay(); // 0=Sun

    // Slightly declining week 1, recovering week 2 to simulate realistic pattern
    const weekMultiplier = i > 7 ? 0.9 : 1.0;
    const isRestDay = dayOfWeek === 0; // Sunday = rest

    // Upsert log
    const log = await prisma.dailyLog.upsert({
      where: { date },
      create: { date },
      update: {},
    });

    // Sleep — some bad nights mid-week
    const isBadSleepNight = i === 11 || i === 4; // two rough nights
    const sleepHours = isBadSleepNight ? jitter(5.5) : jitter(7.5 * weekMultiplier);
    await prisma.sleep.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        hours: sleepHours,
        quality: isBadSleepNight ? randInt(4, 6) : randInt(6, 9),
        bedtime: isBadSleepNight ? "01:30" : "22:45",
        waketime: "06:30",
        remPct: jitter(22, 0.2),
        deepPct: jitter(18, 0.2),
        hrv: jitter(isBadSleepNight ? 42 : 58, 0.1),
        restingHr: isBadSleepNight ? randInt(62, 68) : randInt(54, 62),
      },
      update: {},
    });

    // Workout
    const wType = isRestDay ? "rest" : workoutTypes[i % workoutTypes.length];
    await prisma.workout.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        type: wType,
        duration: wType === "rest" ? 0 : jitter(55, 0.2),
        intensity: wType === "rest" ? 0 : randInt(6, 9),
        caloriesBurned: wType === "rest" ? 0 : jitter(480, 0.2),
        muscleGroups: wType === "rest" ? "" : muscleSets[i % muscleSets.length],
      },
      update: {},
    });

    // Stimulants — too much caffeine some days
    const highCaffeine = i === 10 || i === 3;
    await prisma.stimulants.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        caffeineMg: highCaffeine ? jitter(380) : jitter(175),
        nicotineMg: 0,
        timeConsumed: highCaffeine ? "07:00, 10:00, 14:30" : "07:00, 12:00",
      },
      update: {},
    });

    // Macros — some low-protein days
    const lowProteinDay = i === 9 || i === 2;
    const p = lowProteinDay ? jitter(130, 0.1) : jitter(175 * weekMultiplier, 0.1);
    const c = jitter(240, 0.15);
    const f = jitter(72, 0.15);
    await prisma.macros.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        protein: p,
        carbs: c,
        fats: f,
        calories: Math.round(p * 4 + c * 4 + f * 9),
        waterOz: jitter(90, 0.2),
        mealCount: randInt(3, 4),
      },
      update: {},
    });

    // Supplements
    await prisma.supplement.deleteMany({ where: { dailyLogId: log.id } });
    await prisma.supplement.createMany({
      data: defaultSupplements.map((s) => ({
        dailyLogId: log.id,
        name: s.name,
        dose: s.dose,
        time: s.time,
        taken: Math.random() > 0.15, // 85% compliance
      })),
    });

    // Finances
    const goodRevDay = i % 3 === 0;
    const income = goodRevDay ? jitter(650, 0.3) : jitter(280, 0.3);
    const spend = jitter(85, 0.4);
    await prisma.finances.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        income,
        spend,
        netForDay: income - spend,
        runningMonthlyNet: (income - spend) * (30 - i),
      },
      update: {},
    });

    // Health metrics
    const stressDay = isBadSleepNight;
    await prisma.healthMetrics.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        weight: jitter(182, 0.01),
        bodyFatPct: jitter(16.5, 0.02),
        mood: stressDay ? randInt(4, 6) : randInt(6, 9),
        energy: stressDay ? randInt(4, 6) : randInt(6, 9),
        stress: stressDay ? randInt(6, 9) : randInt(2, 5),
        focus: stressDay ? randInt(4, 6) : randInt(6, 9),
      },
      update: {},
    });

    // Entrepreneurial
    const productiveDay = !isRestDay && !stressDay;
    await prisma.entrepreneurial.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        tasksCompleted: productiveDay ? randInt(6, 12) : randInt(2, 5),
        deepWorkHours: productiveDay ? jitter(3.8, 0.2) : jitter(1.5, 0.3),
        revenueActivityHours: productiveDay ? jitter(3.0, 0.2) : jitter(1.0, 0.3),
        keyWins: productiveDay
          ? ["Shipped new feature", "Sales call booked", "Content published"][i % 3]
          : undefined,
        blockers: !productiveDay ? "Low energy, poor focus" : undefined,
        projectTags: "SaaS, content, sales",
      },
      update: {},
    });

    // Seed pre-computed scores so the dashboard shows data without API calls
    const sleepScore = sleepHours >= 8 ? 92 : sleepHours >= 7 ? 80 : sleepHours >= 6 ? 62 : 40;
    const workoutScore = wType === "rest" ? 65 : jitter(80, 0.1);
    const stimScore = highCaffeine ? 45 : 88;
    const macroScore = lowProteinDay ? 60 : jitter(82, 0.1);
    const supScore = jitter(85, 0.1);
    const finScore = income > 500 ? jitter(88, 0.1) : jitter(65, 0.1);
    const healthScore = stressDay ? 55 : jitter(78, 0.1);
    const entScore = productiveDay ? jitter(80, 0.1) : 55;
    const overall = Math.round(
      (sleepScore + workoutScore + stimScore + macroScore + supScore + finScore + healthScore + entScore) / 8
    );

    await prisma.dailyScore.upsert({
      where: { dailyLogId: log.id },
      create: {
        dailyLogId: log.id,
        sleepScore,
        workoutScore,
        stimulantsScore: stimScore,
        macrosScore: macroScore,
        supplementsScore: supScore,
        financesScore: finScore,
        healthScore,
        entrepreneurialScore: entScore,
        overallScore: overall,
        recommendation:
          i === 0
            ? `You've averaged ${(sleepHours).toFixed(1)}h sleep over the past 3 nights — below your 8h target. Cap caffeine at 2pm tomorrow and aim for 10:30pm in bed. Your deep work is ${productiveDay ? "solid" : "below target"}; block 4h focused time before noon.`
            : null,
        priorityAction:
          i === 0
            ? sleepHours < 7
              ? "Fix sleep tonight — set a 10:30pm hard cutoff, no screens after 10pm."
              : "Hit 180g protein today; you've missed it 2 of the last 3 days."
            : null,
        warnings:
          i === 0 && highCaffeine
            ? JSON.stringify(["Caffeine intake was 380mg — 90% above your 200mg limit. You consumed it at 2:30pm which likely impacted your sleep quality."])
            : JSON.stringify([]),
        dataHash: "seed",
      },
      update: {},
    });

    console.log(`  ✓ Day ${14 - i} seeded (${date.toISOString().slice(0, 10)})`);
  }

  console.log("\n✅ Seed complete. 14 days of data loaded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
