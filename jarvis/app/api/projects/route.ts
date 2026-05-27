import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const rows = await prisma.project.findMany({
    where: status ? { status } : undefined,
    include: {
      logs: { orderBy: { date: "desc" }, take: 3 },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const row = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        status: body.status ?? "Active",
        priority: body.priority ?? 3,
        color: body.color ?? "#60a5fa",
        targetCompletionDate: body.targetCompletionDate ? new Date(body.targetCompletionDate) : null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...data } = body;
    const row = await prisma.project.update({
      where: { id },
      data: {
        ...data,
        targetCompletionDate: data.targetCompletionDate ? new Date(data.targetCompletionDate) : null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
