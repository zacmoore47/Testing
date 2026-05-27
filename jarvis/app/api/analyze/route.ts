import { NextRequest, NextResponse } from "next/server";
import { generateDailyAnalysis } from "@/lib/ai/scorer";
import { parseISO, startOfDay } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const { date, force } = await req.json();
    if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

    const targetDate = startOfDay(parseISO(date));

    // If force, clear cache first
    if (force) {
      const { prisma } = await import("@/lib/db");
      const log = await prisma.dailyLog.findFirst({ where: { date: targetDate } });
      if (log) {
        await prisma.dailyScore.updateMany({
          where: { dailyLogId: log.id },
          data: { dataHash: null },
        });
      }
    }

    const analysis = await generateDailyAnalysis(targetDate);
    return NextResponse.json(analysis);
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
