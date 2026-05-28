import { NextRequest, NextResponse } from "next/server";
import { prisma, getOrCreateProfile } from "@/lib/db";
import { randomBytes } from "crypto";

export async function GET() {
  const profile = await getOrCreateProfile();
  // Mask token — only return last 4 chars
  const masked = profile.apiToken
    ? `${"•".repeat(28)}${profile.apiToken.slice(-4)}`
    : null;
  return NextResponse.json({ ...profile, apiTokenMasked: masked, apiToken: undefined });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { generateToken, ...rest } = body;

    const updateData: Record<string, unknown> = { ...rest };
    let newToken: string | null = null;

    if (generateToken) {
      newToken = randomBytes(32).toString("hex");
      updateData.apiToken = newToken;
    }

    const profile = await prisma.userProfile.upsert({
      where: { id: 1 },
      create: { id: 1, ...updateData },
      update: updateData,
    });

    const masked = profile.apiToken
      ? `${"•".repeat(28)}${profile.apiToken.slice(-4)}`
      : null;

    return NextResponse.json({
      ...profile,
      apiTokenMasked: masked,
      apiToken: undefined,
      // Only return the raw token immediately after generation
      ...(newToken ? { newToken } : {}),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
