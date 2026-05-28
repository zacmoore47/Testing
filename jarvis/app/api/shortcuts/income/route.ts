import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";
import { startOfDay, endOfDay } from "date-fns";

const schema = z.object({
  amount: z.number().positive(),
  source: z.string().optional().default("Other"),
  description: z.string().optional().default(""),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    await prisma.income.create({
      data: { date: new Date(), amount: data.amount, source: data.source, description: data.description || null },
    });

    const today = startOfDay(new Date());
    const todayIncome = await prisma.income.findMany({ where: { date: { gte: today, lte: endOfDay(new Date()) } } });
    const total = todayIncome.reduce((s, i) => s + i.amount, 0);

    const msg = `Logged £${data.amount.toFixed(2)} from ${data.source}, Sir. Today's income total is £${total.toFixed(2)}.`;
    await logApiCall("/api/shortcuts/income", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to log income";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/income", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
