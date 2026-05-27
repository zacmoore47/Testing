import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseISO, startOfDay } from "date-fns";

// Toggle habit completion for a specific date
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const habitId = parseInt(id);
    const body = await req.json();
    const date = startOfDay(parseISO(body.date));

    const existing = await prisma.habitCompletion.findUnique({
      where: { habitId_date: { habitId, date } },
    });

    if (existing) {
      await prisma.habitCompletion.delete({
        where: { habitId_date: { habitId, date } },
      });
      return NextResponse.json({ completed: false });
    } else {
      await prisma.habitCompletion.create({
        data: { habitId, date, completed: true },
      });
      return NextResponse.json({ completed: true });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
