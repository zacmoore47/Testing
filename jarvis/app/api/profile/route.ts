import { NextRequest, NextResponse } from "next/server";
import { prisma, getOrCreateProfile } from "@/lib/db";

export async function GET() {
  const profile = await getOrCreateProfile();
  return NextResponse.json(profile);
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const profile = await prisma.userProfile.upsert({
      where: { id: 1 },
      create: { id: 1, ...body },
      update: body,
    });
    return NextResponse.json(profile);
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
