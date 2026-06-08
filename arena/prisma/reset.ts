import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Delete in dependency order
  await prisma.reaction.deleteMany({});
  await prisma.comment.deleteMany({});
  await prisma.feedItem.deleteMany({});
  await prisma.logEntry.deleteMany({});
  await prisma.streak.deleteMany({});
  await prisma.seasonPoints.deleteMany({});
  await prisma.season.deleteMany({});

  // Reset user points to 0
  await prisma.user.updateMany({ data: { totalPoints: 0 } });

  // Create fresh weekly season
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + daysToMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const users = await prisma.user.findMany({ select: { id: true } });

  const weekly = await prisma.season.create({
    data: { type: "WEEKLY", startDate: weekStart, endDate: weekEnd },
  });
  await prisma.seasonPoints.createMany({
    data: users.map((u) => ({ seasonId: weekly.id, userId: u.id })),
  });

  const monthly = await prisma.season.create({
    data: { type: "MONTHLY", startDate: monthStart, endDate: monthEnd },
  });
  await prisma.seasonPoints.createMany({
    data: users.map((u) => ({ seasonId: monthly.id, userId: u.id })),
  });

  console.log("✅ Points reset. Habits and users preserved.");
  console.log(`✅ New weekly season: ${weekStart.toDateString()} → ${weekEnd.toDateString()}`);
  console.log(`✅ New monthly season: ${monthStart.toDateString()} → ${monthEnd.toDateString()}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
