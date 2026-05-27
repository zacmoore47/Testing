import { NextResponse } from "next/server";
import { getLondonWeatherAndFact } from "@/lib/weather";

export async function GET() {
  const data = await getLondonWeatherAndFact();
  return NextResponse.json(data);
}
