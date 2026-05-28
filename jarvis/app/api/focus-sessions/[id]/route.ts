import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { endedAt, actualMinutes, completed, notes } = body;

  const session = await prisma.focusSession.update({
    where: { id: parseInt(id) },
    data: {
      ...(endedAt !== undefined ? { endedAt: endedAt ? new Date(endedAt) : null } : {}),
      ...(actualMinutes !== undefined ? { actualMinutes } : {}),
      ...(completed !== undefined ? { completed } : {}),
      ...(notes !== undefined ? { notes } : {}),
    },
    include: { project: { select: { name: true } }, task: { select: { title: true } } },
  });

  // If completed work session linked to a project, auto-create a ProjectLog
  if (completed && session.sessionType === "Work" && session.projectId && session.actualMinutes) {
    await prisma.projectLog.create({
      data: {
        projectId: session.projectId,
        date: session.startedAt,
        hoursWorked: parseFloat((session.actualMinutes / 60).toFixed(2)),
        whatWasCompleted: notes ?? "Focus session completed",
      },
    });
  }

  return NextResponse.json(session);
}
