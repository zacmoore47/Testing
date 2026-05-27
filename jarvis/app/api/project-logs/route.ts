import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseISO, startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const date = req.nextUrl.searchParams.get("date");

  if (date) {
    const d = parseISO(date);
    const logs = await prisma.projectLog.findMany({
      where: { date: { gte: startOfDay(d), lte: endOfDay(d) } },
      include: { project: { select: { id: true, name: true, color: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(logs);
  }

  if (projectId) {
    const logs = await prisma.projectLog.findMany({
      where: { projectId: parseInt(projectId) },
      orderBy: { date: "desc" },
    });
    return NextResponse.json(logs);
  }

  return NextResponse.json({ error: "projectId or date required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const log = await prisma.projectLog.create({
      data: {
        projectId: body.projectId,
        date: startOfDay(parseISO(body.date)),
        hoursWorked: body.hoursWorked,
        whatWasCompleted: body.whatWasCompleted,
        blockers: body.blockers ?? null,
        nextStep: body.nextStep ?? null,
      },
      include: { project: { select: { id: true, name: true, color: true } } },
    });
    return NextResponse.json(log);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.projectLog.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
