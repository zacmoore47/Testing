import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay } from "date-fns";

const schema = z.object({
  type: z.string().min(1),
  duration: z.number().int().positive(),
  intensity: z.number().int().min(1).max(10).optional().default(7),
  muscleGroups: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    const today = startOfDay(new Date());
    const log = await prisma.dailyLog.upsert({ where: { date: today }, create: { date: today }, update: {} });

    await prisma.workout.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, type: data.type, duration: data.duration, intensity: data.intensity, muscleGroups: data.muscleGroups ?? null, notes: data.notes ?? null },
      update: { type: data.type, duration: data.duration, intensity: data.intensity, muscleGroups: data.muscleGroups ?? null, notes: data.notes ?? null },
    });

    const msg = `${data.duration} minutes of ${data.type} logged, Sir.`;
    await logApiCall("/api/shortcuts/workout", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to log workout";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/workout", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
