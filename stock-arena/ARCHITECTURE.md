# Architecture

## Flow

```
ticker in ──> [Researcher] ──> sourced Dossier (JSON, shared with everyone)
                                   │
        ┌──────────────┬──────────┴───────────┬───────────────┐
     [Bull]         [Bear]            [Technical/Quant]   [Macro/Contrarian]
        └──────────────┴──── debate rounds ────┴───────────────┐
                                   │                           │
                              [Judge] checks convergence       │
                                   │                           │
                          (loop up to N rounds)  <─────────────┘
                                   │
                            [Risk Manager] ──> Risk Memo (independent, can veto)
                                   │
                          [Decision Maker / PM] ──> Final Verdict
                                   │
                          persist + stream to UI
```

## Directory structure

```
src/
  agents/         # System prompts for each agent (editable text files)
    shared-rules.ts
    researcher.ts
    bull.ts
    bear.ts
    technical.ts
    macro.ts
    judge.ts
    risk-manager.ts
    decision-maker.ts
  orchestrator/   # Session orchestration — runs the full pipeline
    index.ts
  data/           # Market data provider interface + implementations
    provider.ts   # Interface: MarketDataProvider
    fmp.ts        # Financial Modeling Prep implementation
  lib/            # Shared utilities
    config.ts     # Env var loading + validation
    db.ts         # SQLite schema + CRUD
    types.ts      # TypeScript types (Dossier, Verdict, etc.)
  app/
    api/
      research/route.ts  # POST: starts a session, returns SSE stream
      session/route.ts   # GET: list sessions or load one by id
    page.tsx             # Main UI (war room)
    layout.tsx           # Root layout + disclaimer banner
    globals.css          # Tailwind + dark theme
```

## Adding an agent

1. Create a new file in `src/agents/` with the system prompt.
2. Import it in `src/orchestrator/index.ts`.
3. Add it to the relevant pipeline step (analyst round, post-debate, etc.).

## Swapping the data vendor

1. Implement the `MarketDataProvider` interface from `src/data/provider.ts`.
2. Instantiate your provider in `src/app/api/research/route.ts` instead of `FMPProvider`.

## Streaming

The API route returns Server-Sent Events (SSE). Each event is `data: {JSON}\n\n`.
Event types: `status`, `agent_start`, `agent_token`, `agent_done`, `dossier`, `judge`, `risk_memo`, `verdict`, `error`.
