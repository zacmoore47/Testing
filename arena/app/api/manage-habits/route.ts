import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { HabitCategory, HabitType, HabitFrequency } from "@prisma/client";

// GET all habits (same as /api/habits but without today's log state)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const habits = await prisma.habit.findMany({
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

  return NextResponse.json({ habits });
}

// POST create a new habit
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, category, points, type, frequency, unit, minValue, maxPoints, description } = body;

  if (!title || !category || !points || !type || !frequency) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const habit = await prisma.habit.create({
    data: {
      title,
      category: category as HabitCategory,
      points: parseInt(points),
      type: type as HabitType,
      frequency: frequency as HabitFrequency,
      unit: unit || null,
      minValue: minValue ? parseFloat(minValue) : null,
      maxPoints: maxPoints ? parseInt(maxPoints) : parseInt(points),
      description: description || null,
      isActive: true,
    },
  });

  return NextResponse.json({ habit });
}

// PATCH update a habit
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, title, category, points, type, frequency, unit, minValue, maxPoints, description, isActive } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const habit = await prisma.habit.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category: category as HabitCategory }),
      ...(points !== undefined && { points: parseInt(points), maxPoints: parseInt(maxPoints ?? points) }),
      ...(type !== undefined && { type: type as HabitType }),
      ...(frequency !== undefined && { frequency: frequency as HabitFrequency }),
      ...(unit !== undefined && { unit: unit || null }),
      ...(minValue !== undefined && { minValue: minValue ? parseFloat(minValue) : null }),
      ...(maxPoints !== undefined && { maxPoints: parseInt(maxPoints) }),
      ...(description !== undefined && { description: description || null }),
      ...(isActive !== undefined && { isActive }),
    },
  });

  return NextResponse.json({ habit });
}

// DELETE (soft delete — set isActive false)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.habit.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
