import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { config, validateConfig } from "@/lib/config";
import { FMPProvider } from "@/data/fmp";
import { runSession } from "@/orchestrator";
import { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const errors = validateConfig();
  if (errors.length > 0) {
    return new Response(JSON.stringify({ error: errors.join("; ") }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const ticker = (body.ticker as string)?.trim().toUpperCase();
  if (!ticker || !/^[A-Z]{1,5}$/.test(ticker)) {
    return new Response(
      JSON.stringify({ error: "Invalid ticker. Use 1-5 letter symbol." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const provider = new FMPProvider(config.marketDataApiKey);

  const valid = await provider.validateTicker(ticker);
  if (!valid) {
    return new Response(
      JSON.stringify({ error: `Ticker "${ticker}" not found.` }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const sessionId = uuid();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        } catch {
          // stream closed
        }
      };

      emit({ type: "status", content: `Session ${sessionId} started for ${ticker}` });

      runSession(sessionId, ticker, provider, emit)
        .then(() => {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch {
            // already closed
          }
        })
        .catch((err) => {
          emit({ type: "error", content: err.message });
          try {
            controller.close();
          } catch {
            // already closed
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": sessionId,
    },
  });
}
