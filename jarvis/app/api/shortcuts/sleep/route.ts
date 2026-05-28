import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay } from "date-fns";

const schema = z.object({
  hours: z.number().positive().max(24),
  quality: z.number().int().min(1).max(10).optional().default(7),
  bedtime: z.string().optional().default("23:00"),
  waketime: z.string().optional().default("07:00"),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    const today = startOfDay(new Date());
    const log = await prisma.dailyLog.upsert({ where: { date: today }, create: { date: today }, update: {} });

    await prisma.sleep.upsert({
      where: { dailyLogId: log.id },
      create: { dailyLogId: log.id, hours: data.hours, quality: data.quality, bedtime: data.bedtime, waketime: data.waketime },
      update: { hours: data.hours, quality: data.quality, bedtime: data.bedtime, waketime: data.waketime },
    });

    const msg = `${data.hours}h of sleep logged, Sir. Bed at ${data.bedtime}, up at ${data.waketime}.`;
    await logApiCall("/api/shortcuts/sleep", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to log sleep";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/sleep", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
