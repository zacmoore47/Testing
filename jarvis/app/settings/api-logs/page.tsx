"use client";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ApiLog {
  id: number;
  endpoint: string;
  method: string;
  requestBody: string | null;
  responseStatus: number;
  success: boolean;
  createdAt: string;
}

export default function ApiLogsPage() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [filter, setFilter] = useState<"all" | "success" | "error">("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/shortcuts/logs").then((r) => r.json()).then(setLogs).catch(() => {});
  }, []);

  const filtered = logs.filter((l) =>
    filter === "all" ? true : filter === "success" ? l.success : !l.success
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">API Logs</h1>
        <div className="flex gap-1">
          {(["all", "success", "error"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
                filter === f ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-zinc-500">Last 100 calls</CardTitle></CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-500 p-4">No API calls logged yet.</p>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filtered.map((log) => (
                <div key={log.id} className="px-4 py-3">
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${log.success ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                      {log.success ? "✓" : "✗"}
                    </span>
                    <span className="text-xs font-mono text-zinc-300 flex-1">{log.method} {log.endpoint}</span>
                    <Badge className={`text-[10px] ${log.responseStatus < 400 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                      {log.responseStatus}
                    </Badge>
                    <span className="text-[10px] text-zinc-600">
                      {format(new Date(log.createdAt), "MMM d HH:mm:ss")}
                    </span>
                  </div>
                  {expanded === log.id && log.requestBody && (
                    <pre className="mt-2 ml-8 text-[11px] text-zinc-400 bg-zinc-800/50 rounded p-2 overflow-auto max-h-40">
                      {JSON.stringify(JSON.parse(log.requestBody), null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
