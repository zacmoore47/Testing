import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma() {
  const dbPath = path.resolve(process.cwd(), "prisma/dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export async function getOrCreateProfile() {
  return prisma.userProfile.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

export async function getDailyLog(date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.dailyLog.findFirst({
    where: { date: { gte: startOfDay, lte: endOfDay } },
    include: {
      sleep: true,
      workout: true,
      stimulants: true,
      macros: true,
      supplements: true,
      finances: true,
      healthMetrics: true,
      entrepreneurial: true,
      dailyScore: true,
    },
  });
}

export async function getRecentLogs(days: number = 14) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return prisma.dailyLog.findMany({
    where: { date: { gte: cutoff } },
    include: {
      sleep: true,
      workout: true,
      stimulants: true,
      macros: true,
      supplements: true,
      finances: true,
      healthMetrics: true,
      entrepreneurial: true,
      dailyScore: true,
    },
    orderBy: { date: "asc" },
  });
}
