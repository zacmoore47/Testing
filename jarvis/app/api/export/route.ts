import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [logs, profile] = await Promise.all([
    prisma.dailyLog.findMany({
      include: {
        sleep: true, workout: true, stimulants: true, macros: true,
        supplements: true, finances: true, healthMetrics: true,
        entrepreneurial: true, dailyScore: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.userProfile.findFirst(),
  ]);

  return NextResponse.json({ exportedAt: new Date().toISOString(), profile, logs });
}
