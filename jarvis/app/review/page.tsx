"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/charts/TrendChart";
import { scoreColor } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { RefreshCw, TrendingUp, TrendingDown, Target, Zap } from "lucide-react";
import { toast } from "sonner";

interface WeeklyReview {
  overallWeekScore: number;
  biggestWin: string;
  biggestGap: string;
  keyLeveragePoint: string;
  improved: string[];
  regressed: string[];
  correlations: string[];
  nextWeekTarget: string;
}

interface ScoreData {
  date: string;
  overallScore: number;
  sleepScore: number;
  workoutScore: number;
  macrosScore: number;
  entrepreneurialScore: number;
  healthScore: number;
}

export default function ReviewPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingScores, setLoadingScores] = useState(true);

  useEffect(() => {
    async function loadScores() {
      try {
        const res = await fetch("/api/score?days=30");
        const data = await res.json();
        setScores(
          data.map((s: Record<string, unknown>) => ({
            date: format(new Date(s.dailyLog ? (s.dailyLog as Record<string, unknown>).date as string : ""), "yyyy-MM-dd"),
            overallScore: s.overallScore as number,
            sleepScore: s.sleepScore as number,
            workoutScore: s.workoutScore as number,
            macrosScore: s.macrosScore as number,
            entrepreneurialScore: s.entrepreneurialScore as number,
            healthScore: s.healthScore as number,
          }))
        );
      } catch {
        // silent
      } finally {
        setLoadingScores(false);
      }
    }
    loadScores();
  }, []);

  async function generateReview() {
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: format(new Date(), "yyyy-MM-dd"), weeklyReview: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReview(data);
      toast.success("Weekly review generated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to generate review");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Weekly Review</h1>
          <p className="text-zinc-400 text-sm">
            Week of {format(subDays(new Date(), 6), "MMM d")} — {format(new Date(), "MMM d, yyyy")}
          </p>
        </div>
        <Button variant="primary" onClick={generateReview} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analyzing..." : "Generate review"}
        </Button>
      </div>

      {/* 30-day trend chart */}
      {!loadingScores && scores.length > 0 && (
        <Card>
          <CardHeader><CardTitle>30-day overall score</CardTitle></CardHeader>
          <CardContent>
            <TrendChart data={scores.map(s => ({ date: s.date, value: s.overallScore }))} color="#60a5fa" label="Overall" domain={[0, 100]} />
          </CardContent>
        </Card>
      )}

      {/* Review content */}
      {!review && (
        <Card className="py-12 text-center">
          <CardContent>
            <p className="text-zinc-500 mb-4">Generate a weekly review to see AI insights about your performance.</p>
            <Button variant="primary" onClick={generateReview} disabled={loading}>
              {loading ? "Analyzing..." : "Generate now"}
            </Button>
          </CardContent>
        </Card>
      )}

      {review && (
        <>
          {/* Overall score */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="text-center p-6">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Week Score</div>
              <div className={`text-5xl font-bold ${scoreColor(review.overallWeekScore)}`}>
                {review.overallWeekScore}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-1">Biggest win</div>
                  <p className="text-sm text-zinc-300">{review.biggestWin}</p>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start gap-3">
                <TrendingDown className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">Biggest gap</div>
                  <p className="text-sm text-zinc-300">{review.biggestGap}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Key leverage point */}
          <Card className="border-blue-400/30 bg-blue-950/20">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">Key leverage point</div>
                  <p className="text-sm text-zinc-200">{review.keyLeveragePoint}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Improved */}
            <Card>
              <CardHeader><CardTitle className="text-green-400">Improved</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {review.improved.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <TrendingUp className="h-3.5 w-3.5 text-green-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-300">{item}</span>
                    </li>
                  ))}
                  {review.improved.length === 0 && <li className="text-zinc-500 text-sm">Nothing improved this week.</li>}
                </ul>
              </CardContent>
            </Card>

            {/* Regressed */}
            <Card>
              <CardHeader><CardTitle className="text-red-400">Regressed</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {review.regressed.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <TrendingDown className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                      <span className="text-zinc-300">{item}</span>
                    </li>
                  ))}
                  {review.regressed.length === 0 && <li className="text-zinc-500 text-sm">No regressions this week.</li>}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Correlations */}
          {review.correlations.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Patterns & correlations</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {review.correlations.map((c, i) => (
                    <li key={i} className="text-sm text-zinc-300 flex items-start gap-2">
                      <span className="text-zinc-500">→</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Next week target */}
          <Card className="border-yellow-400/20">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Target className="h-5 w-5 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-yellow-400 mb-1">Next week target</div>
                  <p className="text-sm text-zinc-200">{review.nextWeekTarget}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
