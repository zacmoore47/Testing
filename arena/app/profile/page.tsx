import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SignOutButton from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emoji: true, totalPoints: true, createdAt: true },
  });

  if (!user) redirect("/login");

  const streaks = await prisma.streak.findMany({
    where: { userId, current: { gt: 0 } },
    include: { habit: { select: { title: true } } },
    orderBy: { current: "desc" },
    take: 5,
  });

  const logCount = await prisma.logEntry.count({ where: { userId } });

  return (
    <div className="space-y-4">
      <div className="bg-white/5 rounded-2xl p-6 text-center">
        <div className="text-5xl mb-2">{user.emoji}</div>
        <h2 className="text-2xl font-black">{user.name}</h2>
        <p className="text-white/40 text-sm">{user.email}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-xl font-black text-yellow-400">{user.totalPoints}</div>
          <div className="text-xs text-white/40">Total Points</div>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-xl font-black text-yellow-400">{logCount}</div>
          <div className="text-xs text-white/40">Logs</div>
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <div className="text-xl font-black text-yellow-400">{streaks.length}</div>
          <div className="text-xs text-white/40">Active Streaks</div>
        </div>
      </div>

      {streaks.length > 0 && (
        <div className="bg-white/5 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white/50 mb-3">Active Streaks 🔥</h3>
          <div className="space-y-2">
            {streaks.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span className="text-sm text-white/70">{s.habit.title}</span>
                <span className="text-orange-400 font-bold text-sm">{s.current} days</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <SignOutButton />
    </div>
  );
}
