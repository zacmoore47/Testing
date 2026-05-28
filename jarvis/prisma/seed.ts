import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { subDays, startOfDay, addMinutes } from "date-fns";
import path from "path";
import { randomBytes } from "crypto";

const dbPath = path.resolve(__dirname, "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const apiToken = randomBytes(32).toString("hex");

  await prisma.userProfile.upsert({
    where: { id: 1 },
    create: { id: 1, apiToken },
    update: { apiToken },
  });

  // ── Sample projects for focus sessions ───────────────────────────────────
  const projects = await Promise.all([
    prisma.project.upsert({ where: { id: 1 }, create: { name: "SaaS MVP", status: "Active", priority: 5, color: "#60a5fa" }, update: {} }),
    prisma.project.upsert({ where: { id: 2 }, create: { name: "Content Engine", status: "Active", priority: 3, color: "#34d399" }, update: {} }),
  ]);

  // ── Focus sessions (last 7 days) ─────────────────────────────────────────
  const focusSamples = [
    { daysAgo: 0, startHour: 9, mins: 25, projectIdx: 0 },
    { daysAgo: 0, startHour: 10, mins: 25, projectIdx: 0 },
    { daysAgo: 1, startHour: 9, mins: 50, projectIdx: 0 },
    { daysAgo: 1, startHour: 14, mins: 25, projectIdx: 1 },
    { daysAgo: 2, startHour: 10, mins: 25, projectIdx: 0 },
    { daysAgo: 3, startHour: 8, mins: 25, projectIdx: 0 },
    { daysAgo: 3, startHour: 11, mins: 25, projectIdx: 1 },
    { daysAgo: 4, startHour: 9, mins: 25, projectIdx: 0 },
    { daysAgo: 5, startHour: 10, mins: 50, projectIdx: 0 },
    { daysAgo: 6, startHour: 14, mins: 25, projectIdx: 0 },
  ];

  for (const s of focusSamples) {
    const start = new Date(startOfDay(subDays(new Date(), s.daysAgo)));
    start.setHours(s.startHour, 0, 0, 0);
    const end = addMinutes(start, s.mins);
    await prisma.focusSession.create({
      data: {
        projectId: projects[s.projectIdx].id,
        startedAt: start,
        endedAt: end,
        plannedMinutes: s.mins,
        actualMinutes: s.mins,
        sessionType: "Work",
        completed: true,
        notes: "Focus session completed",
      },
    });
  }

  console.log(`✅ Database ready:`);
  console.log(`   - UserProfile initialised with API token`);
  console.log(`   - ${focusSamples.length} sample focus sessions seeded`);
  console.log(`   - API token: ${apiToken.slice(0, 8)}...${apiToken.slice(-4)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
