# Jarvis — Personal Life Optimization Dashboard

A local-first web app that tracks every dimension of your performance, scores each sector daily using Claude AI, and tells you exactly where to focus your energy.

## Setup

### 1. Install dependencies

```bash
cd jarvis
npm install
```

### 2. Add your Anthropic API key

Copy `.env.local` and fill in your key:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run database migrations

The SQLite database is already initialized. To reset and re-migrate:

```bash
npm run db:migrate
```

### 4. Seed sample data (optional but recommended)

Loads 14 days of realistic data so the dashboard is alive immediately:

```bash
npm run seed
```

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Routes

| Route | Description |
|-------|-------------|
| `/` | Dashboard — today's score ring, 8 sector cards with sparklines, AI focus card |
| `/log` | Quick entry form for all sectors with keyboard shortcuts |
| `/sector/[name]` | 90-day trend chart + daily history for any sector |
| `/review` | AI-generated weekly review with correlations and next-week target |
| `/settings` | Edit all goals, export data as JSON |

---

## Keyboard shortcuts (on `/log` page)

Press a letter while **not** focused in an input to jump to that section:

| Key | Section |
|-----|---------|
| S | Sleep |
| W | Workout |
| C | Stimulants (Caffeine) |
| M | Macros / Nutrition |
| U | Supplements |
| F | Finances |
| H | Health Metrics |
| E | Entrepreneurial |

---

## Architecture

```
jarvis/
├── app/                    # Next.js 14 App Router pages + API routes
│   ├── page.tsx            # Dashboard (server component)
│   ├── log/page.tsx        # Daily entry form
│   ├── sector/[name]/      # Sector detail page
│   ├── review/page.tsx     # Weekly review
│   ├── settings/page.tsx   # Goals editor
│   └── api/
│       ├── analyze/        # POST: trigger AI analysis for a date
│       ├── log/            # GET/POST: daily log CRUD
│       ├── score/          # GET: score history (for charts)
│       ├── profile/        # GET/PUT: user goals
│       └── export/         # GET: full data export
├── components/
│   ├── ui/                 # Reusable primitives (Card, Button, Input, etc.)
│   ├── dashboard/          # ScoreRing, SectorCard, FocusCard, StreakIndicator
│   ├── charts/             # SparkLine, TrendChart (Recharts)
│   └── forms/              # DailyLogForm
├── lib/
│   ├── db.ts               # Prisma client singleton (SQLite via better-sqlite3)
│   ├── utils.ts            # cn(), goalScore(), scoreColor(), etc.
│   └── ai/
│       ├── prompts.ts      # AI prompt templates — edit to tune scoring behavior
│       └── scorer.ts       # generateDailyAnalysis() — calls Claude, caches in DB
├── prisma/
│   ├── schema.prisma       # Full data model
│   ├── seed.ts             # 14-day realistic seed data
│   └── dev.db              # SQLite database (local file)
└── types/index.ts          # Shared TypeScript types
```

---

## How AI scoring works

`lib/ai/scorer.ts` → `generateDailyAnalysis(date)`:

1. Pulls today's log from the DB
2. Computes a `dataHash` — if the hash matches the cached value, returns the cached score (no API call)
3. Fetches the last 14 days as context
4. Sends a structured prompt to `claude-opus-4-5` with your goals and all the data
5. Parses the JSON response into sector scores (0–100) + recommendation + priority action + warnings
6. Persists the result — future page loads use the cache until data changes or you force-refresh

**Scores are goal-relative.** 8h sleep is 100 if your goal is 8h. It's ~89 if your goal is 9h. Edit `lib/ai/prompts.ts` to tune the scoring persona or add domain-specific context.

---

## Assumptions made

- Default goals: 8h sleep, 180g protein, 2400 cal, 100oz water, $500/day income, 4h deep work
- Supplement defaults: Creatine, D3, Magnesium, Omega-3
- Calories auto-calculate from macros on the log form (4/4/9 formula)
- AI analysis is cached per day; refreshable via the dashboard's ↻ button
- Weekly review must be manually triggered (it costs an API call)
- Database is local SQLite only — no cloud sync

---

## npm scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run seed         # Populate 14 days of sample data
npm run db:migrate   # Apply schema migrations
npm run db:studio    # Open Prisma Studio (DB GUI)
```
