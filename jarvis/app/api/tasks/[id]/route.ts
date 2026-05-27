import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { title, description, priority, status, dueDate, projectId, estimatedMinutes, order } = body;

  const completedAt =
    status === "Completed"
      ? (await prisma.task.findUnique({ where: { id: parseInt(id) } }))?.completedAt ?? new Date()
      : status === "Pending" || status === "InProgress"
      ? null
      : undefined;

  const task = await prisma.task.update({
    where: { id: parseInt(id) },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(projectId !== undefined ? { projectId: projectId ?? null } : {}),
      ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
      ...(order !== undefined ? { order } : {}),
      ...(completedAt !== undefined ? { completedAt } : {}),
    },
    include: { project: { select: { name: true } } },
  });

  return NextResponse.json({
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    projectName: task.project?.name ?? null,
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.task.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ ok: true });
}
