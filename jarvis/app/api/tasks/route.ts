import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const projectId = searchParams.get("projectId");
  const priority = searchParams.get("priority");
  const limit = searchParams.get("limit");

  const tasks = await prisma.task.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(projectId ? { projectId: parseInt(projectId) } : {}),
      ...(priority ? { priority: parseInt(priority) } : {}),
    },
    include: { project: { select: { name: true } } },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }, { createdAt: "asc" }],
    ...(limit ? { take: parseInt(limit) } : {}),
  });

  return NextResponse.json(
    tasks.map((t) => ({
      ...t,
      dueDate: t.dueDate?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      projectName: t.project?.name ?? null,
    }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, priority, dueDate, projectId, estimatedMinutes } = body;

  const maxOrder = await prisma.task.aggregate({ _max: { order: true } });
  const nextOrder = (maxOrder._max.order ?? 0) + 1;

  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? null,
      priority: priority ?? 3,
      dueDate: dueDate ? new Date(dueDate) : null,
      projectId: projectId ?? null,
      estimatedMinutes: estimatedMinutes ?? null,
      order: nextOrder,
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
