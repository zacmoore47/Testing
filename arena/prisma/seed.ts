import { PrismaClient, HabitCategory, HabitType, HabitFrequency } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const HABITS = [
  // HEALTH
  { title: "Gym / Workout Session", category: HabitCategory.HEALTH, points: 30, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 30 },
  { title: "Slept 7+ Hours", category: HabitCategory.HEALTH, points: 20, type: HabitType.NUMERIC, frequency: HabitFrequency.DAILY, unit: "hours", minValue: 7, maxPoints: 20 },
  { title: "10,000 Steps", category: HabitCategory.HEALTH, points: 15, type: HabitType.NUMERIC, frequency: HabitFrequency.DAILY, unit: "steps", minValue: 10000, maxPoints: 15 },
  { title: "Clean Eating Day", description: "No junk food", category: HabitCategory.HEALTH, points: 15, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 15 },
  { title: "Morning Routine Before 8am", category: HabitCategory.HEALTH, points: 10, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 10 },
  // WEALTH
  { title: "1hr Deep Work on the Business", category: HabitCategory.WEALTH, points: 30, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 30 },
  { title: "Customer / Discovery Interview", category: HabitCategory.WEALTH, points: 60, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 60 },
  { title: "Shipped a Feature / Launched Something", category: HabitCategory.WEALTH, points: 100, type: HabitType.MILESTONE, frequency: HabitFrequency.ONE_OFF, maxPoints: 100 },
  { title: "Build-in-Public Post / Content", category: HabitCategory.WEALTH, points: 20, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 20 },
  { title: "10 Cold Outreach Messages", category: HabitCategory.WEALTH, points: 25, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 25 },
  { title: "Reviewed Budget / Tracked Finances", category: HabitCategory.WEALTH, points: 15, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 15 },
  { title: "Saved or Invested Money", category: HabitCategory.WEALTH, points: 20, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 20 },
  // LEARNING
  { title: "Read 30+ Minutes", category: HabitCategory.LEARNING, points: 20, type: HabitType.NUMERIC, frequency: HabitFrequency.DAILY, unit: "minutes", minValue: 30, maxPoints: 20 },
  { title: "Finished a Book", category: HabitCategory.LEARNING, points: 100, type: HabitType.MILESTONE, frequency: HabitFrequency.ONE_OFF, maxPoints: 100 },
  { title: "Completed a Course Lesson", category: HabitCategory.LEARNING, points: 25, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 25 },
  { title: "Practiced a Skill 1hr", category: HabitCategory.LEARNING, points: 25, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 25 },
  // MIND
  { title: "Meditated 10 Minutes", category: HabitCategory.MIND, points: 10, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 10 },
  { title: "Journaled", category: HabitCategory.MIND, points: 10, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 10 },
  { title: "Stayed Under Screen-Time Limit", category: HabitCategory.MIND, points: 15, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 15 },
  { title: "Planned Tomorrow the Night Before", category: HabitCategory.MIND, points: 10, type: HabitType.BOOLEAN, frequency: HabitFrequency.DAILY, maxPoints: 10 },
];

async function main() {
  // Seed users
  const zac = await prisma.user.upsert({
    where: { email: "zac@arena.app" },
    update: {},
    create: {
      name: "Zac",
      email: "zac@arena.app",
      passwordHash: await bcrypt.hash("arena123", 10),
      emoji: "⚡",
    },
  });

  const friend = await prisma.user.upsert({
    where: { email: "friend@arena.app" },
    update: {},
    create: {
      name: "Jack",
      email: "friend@arena.app",
      passwordHash: await bcrypt.hash("arena123", 10),
      emoji: "🔥",
    },
  });

  // Update name if already seeded with old value
  await prisma.user.update({ where: { email: "friend@arena.app" }, data: { name: "Jack" } });
  console.log(`✅ Users: ${zac.name} (${zac.email}), Jack (${friend.email})`);

  // Delete existing habits and re-seed for idempotency
  await prisma.habit.deleteMany({});
  await prisma.habit.createMany({ data: HABITS });

  console.log(`✅ Habits: ${HABITS.length} seeded`);

  // Create current weekly season if none exists
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + daysToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const existingWeekly = await prisma.season.findFirst({
    where: { type: "WEEKLY", startDate: { lte: now }, endDate: { gt: now } },
  });

  if (!existingWeekly) {
    const season = await prisma.season.create({
      data: { type: "WEEKLY", startDate: weekStart, endDate: weekEnd },
    });
    await prisma.seasonPoints.createMany({
      data: [
        { seasonId: season.id, userId: zac.id },
        { seasonId: season.id, userId: friend.id },
      ],
    });
    console.log(`✅ Weekly season created: ${weekStart.toDateString()} → ${weekEnd.toDateString()}`);
  }

  // Create current monthly season if none exists
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const existingMonthly = await prisma.season.findFirst({
    where: { type: "MONTHLY", startDate: { lte: now }, endDate: { gt: now } },
  });

  if (!existingMonthly) {
    const season = await prisma.season.create({
      data: { type: "MONTHLY", startDate: monthStart, endDate: monthEnd },
    });
    await prisma.seasonPoints.createMany({
      data: [
        { seasonId: season.id, userId: zac.id },
        { seasonId: season.id, userId: friend.id },
      ],
    });
    console.log(`✅ Monthly season created: ${monthStart.toDateString()} → ${monthEnd.toDateString()}`);
  }

  console.log("\n🏟️  The Arena is ready!");
  console.log("   Zac:    zac@arena.app / arena123");
  console.log("   Friend: friend@arena.app / arena123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
