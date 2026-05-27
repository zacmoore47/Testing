import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DailyLogInput } from "@/types";
import { parseISO, startOfDay } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body: DailyLogInput = await req.json();
    const date = startOfDay(parseISO(body.date));

    // Upsert the daily log record
    const log = await prisma.dailyLog.upsert({
      where: { date },
      create: { date },
      update: { updatedAt: new Date() },
    });

    // Upsert each sector
    if (body.sleep) {
      await prisma.sleep.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.sleep },
        update: body.sleep,
      });
    }

    if (body.workout) {
      await prisma.workout.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.workout },
        update: body.workout,
      });
    }

    if (body.stimulants) {
      await prisma.stimulants.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.stimulants },
        update: body.stimulants,
      });
    }

    if (body.macros) {
      await prisma.macros.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.macros },
        update: body.macros,
      });
    }

    if (body.supplements && body.supplements.length > 0) {
      // Delete existing and re-insert
      await prisma.supplement.deleteMany({ where: { dailyLogId: log.id } });
      await prisma.supplement.createMany({
        data: body.supplements.map((s) => ({ dailyLogId: log.id, ...s })),
      });
    }

    if (body.finances) {
      await prisma.finances.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.finances },
        update: body.finances,
      });
    }

    if (body.healthMetrics) {
      await prisma.healthMetrics.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.healthMetrics },
        update: body.healthMetrics,
      });
    }

    if (body.entrepreneurial) {
      await prisma.entrepreneurial.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...body.entrepreneurial },
        update: body.entrepreneurial,
      });
    }

    // Invalidate cache by clearing dataHash
    await prisma.dailyScore.updateMany({
      where: { dailyLogId: log.id },
      data: { dataHash: null },
    });

    return NextResponse.json({ success: true, logId: log.id });
  } catch (e: unknown) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  const d = startOfDay(parseISO(date));
  const log = await prisma.dailyLog.findFirst({
    where: { date: d },
    include: {
      sleep: true, workout: true, stimulants: true, macros: true,
      supplements: true, finances: true, healthMetrics: true,
      entrepreneurial: true, dailyScore: true,
    },
  });

  return NextResponse.json(log);
}
