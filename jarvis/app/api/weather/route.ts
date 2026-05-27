import { NextResponse } from "next/server";
import { getLondonWeather } from "@/lib/weather";

export async function GET() {
  const weather = await getLondonWeather();
  if (!weather) return NextResponse.json(null);
  return NextResponse.json(weather);
}
