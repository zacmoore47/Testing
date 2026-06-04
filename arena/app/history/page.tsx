import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;

  const logs = await prisma.logEntry.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 60,
    include: { habit: { select: { title: true, category: true, points: true } } },
  });

  const grouped: Record<string, typeof logs> = {};
  for (const log of logs) {
    const dateStr = log.date.toISOString().slice(0, 10);
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(log);
  }

  const catEmoji: Record<string, string> = {
    HEALTH: "💪",
    WEALTH: "💰",
    LEARNING: "📚",
    MIND: "🧘",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-black py-2">History</h2>
      {Object.entries(grouped).map(([date, dayLogs]) => {
        const total = dayLogs.reduce((sum, l) => sum + l.pointsEarned, 0);
        const label = new Date(date + "T12:00:00Z").toLocaleDateString("en-US", {
          weekday: "short", month: "short", day: "numeric",
        });
        return (
          <div key={date} className="bg-white/5 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold text-sm">{label}</div>
              <div className="text-yellow-400 font-bold text-sm">+{total} pts</div>
            </div>
            <div className="space-y-1">
              {dayLogs.map((log) => (
                <div key={log.id} className="flex items-center gap-2 text-sm">
                  <span>{catEmoji[log.habit.category] ?? "•"}</span>
                  <span className="flex-1 text-white/70">{log.habit.title}</span>
                  <span className="text-white/40">+{log.pointsEarned}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {Object.keys(grouped).length === 0 && (
        <div className="text-center text-white/30 py-12">No logs yet. Start logging!</div>
      )}
    </div>
  );
}
