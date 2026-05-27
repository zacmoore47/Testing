import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfDay, subDays } from "date-fns";

export async function GET() {
  const cutoff = subDays(startOfDay(new Date()), 60);
  const habits = await prisma.habit.findMany({
    where: { active: true },
    include: {
      completions: {
        where: { date: { gte: cutoff } },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(habits);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const count = await prisma.habit.count();
    const habit = await prisma.habit.create({
      data: {
        name: body.name,
        icon: body.icon ?? "check",
        color: body.color ?? "#60a5fa",
        targetFrequency: body.targetFrequency ?? "Daily",
        order: count,
      },
    });
    return NextResponse.json(habit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    const habit = await prisma.habit.update({ where: { id }, data });
    return NextResponse.json(habit);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.habit.update({ where: { id: parseInt(id) }, data: { active: false } });
  return NextResponse.json({ success: true });
}
