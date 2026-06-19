import { NextRequest } from "next/server";
import { getSessions, getSession } from "@/lib/db";

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("id");

  if (sessionId) {
    const data = getSession(sessionId);
    if (!data) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return Response.json(data);
  }

  const sessions = getSessions();
  return Response.json(sessions);
}
