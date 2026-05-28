import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startOfDay, subDays } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") ?? "7");
  const active = searchParams.get("active") === "true";

  if (active) {
    const cutoff = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const session = await prisma.focusSession.findFirst({
      where: { endedAt: null, startedAt: { gte: cutoff }, sessionType: "Work" },
      include: { project: { select: { name: true } }, task: { select: { title: true } } },
    });
    return NextResponse.json(session);
  }

  const cutoff = startOfDay(subDays(new Date(), days));
  const sessions = await prisma.focusSession.findMany({
    where: { startedAt: { gte: cutoff } },
    include: { project: { select: { name: true } }, task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
  });
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { projectId, taskId, plannedMinutes, sessionType } = body;

  const session = await prisma.focusSession.create({
    data: {
      projectId: projectId ?? null,
      taskId: taskId ?? null,
      plannedMinutes,
      sessionType: sessionType ?? "Work",
    },
    include: { project: { select: { name: true } }, task: { select: { title: true } } },
  });
  return NextResponse.json(session);
}
