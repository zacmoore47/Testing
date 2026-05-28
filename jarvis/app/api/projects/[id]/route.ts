import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    // Cascade-delete logs and unlink focus sessions before deleting project
    await prisma.projectLog.deleteMany({ where: { projectId: parseInt(id) } });
    await prisma.focusSession.updateMany({ where: { projectId: parseInt(id) }, data: { projectId: null } });
    await prisma.task.updateMany({ where: { projectId: parseInt(id) }, data: { projectId: null } });
    await prisma.project.delete({ where: { id: parseInt(id) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
