import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";

const schema = z.object({
  title: z.string().min(1),
  priority: z.number().int().min(1).max(5).optional().default(3),
  projectName: z.string().optional(),
  dueDate: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    let projectId: number | null = null;
    if (data.projectName) {
      const project = await prisma.project.findFirst({
        where: { name: { contains: data.projectName }, status: "Active" },
      });
      projectId = project?.id ?? null;
    }

    const maxOrder = await prisma.task.aggregate({ _max: { order: true } });
    await prisma.task.create({
      data: {
        title: data.title,
        priority: data.priority,
        projectId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        order: (maxOrder._max.order ?? 0) + 1,
      },
    });

    const msg = `Task added, Sir. Priority ${data.priority}.`;
    await logApiCall("/api/shortcuts/task", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to add task";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/task", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
