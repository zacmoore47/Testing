"use client";
import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Zap, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface FocusCardProps {
  recommendation: string;
  priorityAction: string;
  warnings: string[];
  date: string;
}

export function FocusCard({ recommendation, priorityAction, warnings, date }: FocusCardProps) {
  const [loading, setLoading] = useState(false);
  const [rec, setRec] = useState(recommendation);
  const [priority, setPriority] = useState(priorityAction);
  const [warn, setWarn] = useState(warnings);

  async function handleRefresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, force: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRec(data.recommendation);
      setPriority(data.priorityAction);
      setWarn(data.warnings ?? []);
      toast.success("Analysis refreshed");
    } catch {
      toast.error("Failed to refresh analysis");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-blue-400/20 bg-gradient-to-br from-zinc-900 to-blue-950/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-blue-400">What to focus on right now</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={loading}
            className="text-zinc-500 hover:text-zinc-100"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Priority action */}
        <div className="flex items-start gap-3 rounded-lg bg-blue-500/10 border border-blue-400/20 p-3">
          <Zap className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-sm font-semibold text-blue-100">{priority || "Log today's data to get your priority action."}</p>
        </div>

        {/* Full recommendation */}
        <p className="text-sm text-zinc-300 leading-relaxed">
          {rec || "No analysis yet. Log your daily data and click refresh to get an AI-generated performance analysis."}
        </p>

        {/* Warnings */}
        {warn.length > 0 && (
          <div className="space-y-2">
            {warn.map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-400/20 p-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-200">{w}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
