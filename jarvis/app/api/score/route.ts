import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { subDays } from "date-fns";

// Returns daily scores for a range of days (for sparklines etc.)
export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "30");
  const cutoff = subDays(new Date(), days);

  const scores = await prisma.dailyScore.findMany({
    where: { dailyLog: { date: { gte: cutoff } } },
    include: { dailyLog: { select: { date: true } } },
    orderBy: { dailyLog: { date: "asc" } },
  });

  return NextResponse.json(scores);
}
