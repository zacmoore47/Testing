import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function requireApiToken(req: NextRequest): Promise<{ id: number }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;

  if (!token) throw new ApiAuthError("Missing Bearer token", 401);

  const profile = await prisma.userProfile.findFirst({ where: { apiToken: token } });
  if (!profile) throw new ApiAuthError("Invalid or expired token", 401);

  return { id: profile.id };
}

export class ApiAuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function logApiCall(
  endpoint: string,
  method: string,
  requestBody: string | null,
  responseStatus: number,
  success: boolean
) {
  await prisma.apiLog.create({
    data: { endpoint, method, requestBody, responseStatus, success },
  });
}
