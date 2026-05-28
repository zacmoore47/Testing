import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiToken, ApiAuthError, logApiCall } from "@/lib/api-auth";

const schema = z.object({
  projectName: z.string().min(1),
  hoursWorked: z.number().positive(),
  whatWasCompleted: z.string().min(1),
  blockers: z.string().optional(),
  nextStep: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    await requireApiToken(req);
    body = await req.json();
    const data = schema.parse(body);

    const project = await prisma.project.findFirst({
      where: { name: { contains: data.projectName }, status: "Active" },
    });
    if (!project) return NextResponse.json({ success: false, error: `No active project matching "${data.projectName}".` }, { status: 404 });

    await prisma.projectLog.create({
      data: {
        projectId: project.id,
        date: new Date(),
        hoursWorked: data.hoursWorked,
        whatWasCompleted: data.whatWasCompleted,
        blockers: data.blockers ?? null,
        nextStep: data.nextStep ?? null,
      },
    });

    const msg = `${data.hoursWorked}h logged against ${project.name}, Sir.`;
    await logApiCall("/api/shortcuts/project-log", "POST", JSON.stringify(body), 200, true);
    return NextResponse.json({ success: true, message: msg });
  } catch (e) {
    const msg = e instanceof ApiAuthError ? e.message : e instanceof z.ZodError ? e.message : "Failed to log project work";
    const status = e instanceof ApiAuthError ? e.status : 400;
    await logApiCall("/api/shortcuts/project-log", "POST", JSON.stringify(body ?? null), status, false).catch(() => {});
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
