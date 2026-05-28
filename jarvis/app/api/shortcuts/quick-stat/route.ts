import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay } from "date-fns";

const schema = z.object({
  caffeine: z.number().optional(),
  water: z.number().optional(),
  mood: z.number().int().min(1).max(10).optional(),
  energy: z.number().int().min(1).max(10).optional(),
  focus: z.number().int().min(1).max(10).optional(),
  stress: z.number().int().min(1).max(10).optional(),
  weight: z.number().optional(),
}).refine((d) => Object.values(d).some((v) => v !== undefined), { message: "Provide at least one field" });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    const today = startOfDay(new Date());
    const log = await prisma.dailyLog.upsert({ where: { date: today }, create: { date: today }, update: {} });

    const updated: string[] = [];

    if (data.caffeine !== undefined || data.water !== undefined) {
      await prisma.stimulants.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, caffeineMg: data.caffeine ?? 0 },
        update: { ...(data.caffeine !== undefined ? { caffeineMg: data.caffeine } : {}) },
      });
      if (data.caffeine !== undefined) updated.push(`caffeine ${data.caffeine}mg`);
    }

    const healthFields = { mood: data.mood, energy: data.energy, focus: data.focus, stress: data.stress, weight: data.weight };
    const healthUpdates = Object.fromEntries(Object.entries(healthFields).filter(([, v]) => v !== undefined));
    if (Object.keys(healthUpdates).length > 0) {
      await prisma.healthMetrics.upsert({
        where: { dailyLogId: log.id },
        create: { dailyLogId: log.id, ...healthUpdates },
        update: healthUpdates,
      });
      updated.push(...Object.keys(healthUpdates));
    }

    const msg = `Updated: ${updated.join(", ")}, Sir.`;
    await logApiCall("/api/shortcuts/quick-stat", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to update stats";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/quick-stat", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
