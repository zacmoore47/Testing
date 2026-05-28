"use client";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Timer, Flame } from "lucide-react";
import Link from "next/link";
import { startOfDay } from "date-fns";

interface FocusSession {
  id: number;
  projectId: number | null;
  endedAt: string | null;
  startedAt: string;
  sessionType: string;
  project?: { name: string } | null;
}

export function FocusModeCard() {
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);

  useEffect(() => {
    async function load() {
      const [sessionsRes, activeRes] = await Promise.all([
        fetch("/api/focus-sessions?days=30"),
        fetch("/api/focus-sessions?active=true"),
      ]);
      if (sessionsRes.ok) {
        const sessions: FocusSession[] = await sessionsRes.json();
        const todayStr = startOfDay(new Date()).toISOString().slice(0, 10);
        const todaySessions = sessions.filter(
          (s) => s.sessionType === "Work" && s.startedAt.slice(0, 10) === todayStr
        );
        setTodayMinutes(
          todaySessions.reduce((sum, s) => {
            if (s.endedAt) {
              const mins = Math.round((new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000);
              return sum + mins;
            }
            return sum;
          }, 0)
        );

        // Calculate streak of days with at least one completed work session
        let s = 0;
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dayStr = startOfDay(d).toISOString().slice(0, 10);
          const hasSession = sessions.some(
            (sess) => sess.sessionType === "Work" && sess.startedAt.slice(0, 10) === dayStr
          );
          if (hasSession) s++;
          else if (i > 0) break;
        }
        setStreak(s);
      }
      if (activeRes.ok) {
        const active = await activeRes.json() as FocusSession | null;
        setActiveSession(active);
      }
    }
    void load();
  }, []);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Timer className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-200">Focus</p>
              <p className="text-xs text-zinc-500">
                {todayMinutes > 0 ? `${todayMinutes}min today` : "No sessions yet"}
                {streak > 1 && (
                  <span className="ml-2 inline-flex items-center gap-0.5 text-orange-400">
                    <Flame className="h-3 w-3" />{streak}d
                  </span>
                )}
              </p>
            </div>
          </div>
          <Link href="/focus">
            <Button variant="outline" className="h-8 text-xs gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {activeSession ? "Return to session" : "Start session"}
            </Button>
          </Link>
        </div>
        {activeSession && (
          <div className="mt-3 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
            Session in progress{activeSession.project ? ` — ${activeSession.project.name}` : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
