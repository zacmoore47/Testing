import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseISO, startOfDay, endOfDay, subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date");
  const days = req.nextUrl.searchParams.get("days");

  if (date) {
    const d = parseISO(date);
    const rows = await prisma.expense.findMany({
      where: { date: { gte: startOfDay(d), lte: endOfDay(d) } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(rows);
  }

  if (days) {
    const cutoff = subDays(new Date(), parseInt(days));
    const rows = await prisma.expense.findMany({
      where: { date: { gte: startOfDay(cutoff) } },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(rows);
  }

  return NextResponse.json({ error: "date or days param required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const row = await prisma.expense.create({
      data: {
        date: startOfDay(parseISO(body.date)),
        amount: body.amount,
        category: body.category,
        description: body.description ?? null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.expense.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
