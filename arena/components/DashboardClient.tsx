"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface UserData {
  id: string;
  name: string;
  emoji: string;
  totalPoints: number;
  missedYesterday: boolean;
  todayPoints: number;
  weekPoints: number;
  monthPoints: number;
}

interface Props {
  users: UserData[];
  currentUserId: string;
  weekSeason: { startDate: string; endDate: string } | null;
}

export default function DashboardClient({ users, currentUserId, weekSeason }: Props) {
  const router = useRouter();

  const [me, opponent] = users.length >= 2
    ? users[0].id === currentUserId
      ? [users[0], users[1]]
      : [users[1], users[0]]
    : [users[0], null];

  const gap = opponent ? me.weekPoints - opponent.weekPoints : 0;
  const leading = gap > 0 ? me : opponent;

  function weekDaysLeft() {
    if (!weekSeason) return 0;
    const end = new Date(weekSeason.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <h1 className="text-2xl font-black tracking-widest text-yellow-400">THE ARENA</h1>
        {weekSeason && (
          <p className="text-white/40 text-xs mt-1">{weekDaysLeft()} days left this week</p>
        )}
      </div>

      {/* Head-to-head cards */}
      <div className="grid grid-cols-2 gap-3">
        <PlayerCard user={me} isCurrentUser label="YOU" isLeading={leading?.id === me.id && gap !== 0} />
        {opponent && (
          <PlayerCard user={opponent} isCurrentUser={false} label={opponent.name.toUpperCase()} isLeading={leading?.id === opponent.id && gap !== 0} />
        )}
      </div>

      {/* Gap banner */}
      {opponent && (
        <div className={`rounded-xl p-3 text-center text-sm font-bold ${
          gap > 0 ? "bg-green-500/20 text-green-400" :
          gap < 0 ? "bg-red-500/20 text-red-400" :
          "bg-white/5 text-white/50"
        }`}>
          {gap > 0 && `You're up +${gap} pts this week 🔥`}
          {gap < 0 && `You're down ${Math.abs(gap)} pts — catch up 💀`}
          {gap === 0 && "Tied this week ⚖️"}
        </div>
      )}

      {/* Missed day alerts */}
      {(me.missedYesterday || (opponent?.missedYesterday)) && (
        <div className="space-y-2">
          {me.missedYesterday && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 text-sm text-orange-400">
              ⚠️ You missed yesterday — streaks at risk
            </div>
          )}
          {opponent?.missedYesterday && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-sm text-blue-400">
              👀 {opponent.name} missed yesterday
            </div>
          )}
        </div>
      )}

      {/* Quick log CTA */}
      <Link
        href="/log"
        className="block w-full bg-yellow-400 text-black font-black text-center py-4 rounded-xl text-lg hover:bg-yellow-300 transition active:scale-95"
      >
        ✅ Log Today's Habits
      </Link>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox label="Today" value={`+${me.todayPoints}`} />
        <StatBox label="This Week" value={me.weekPoints.toString()} />
        <StatBox label="All Time" value={me.totalPoints.toString()} />
      </div>
    </div>
  );
}

function PlayerCard({
  user,
  isCurrentUser,
  label,
  isLeading,
}: {
  user: UserData;
  isCurrentUser: boolean;
  label: string;
  isLeading: boolean;
}) {
  return (
    <div className={`relative rounded-2xl p-4 border ${
      isLeading ? "border-yellow-400/60 bg-yellow-400/5" : "border-white/10 bg-white/5"
    }`}>
      {isLeading && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full">
          WINNING
        </div>
      )}
      <div className="text-center">
        <div className="text-3xl mb-1">{user.emoji}</div>
        <div className="text-xs text-white/40 font-bold tracking-wider">{label}</div>
        <div className="text-2xl font-black mt-1">{user.weekPoints}</div>
        <div className="text-xs text-white/40">pts this week</div>
        <div className="text-xs text-white/30 mt-1">{user.totalPoints} all time</div>
      </div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-3">
      <div className="text-lg font-bold text-yellow-400">{value}</div>
      <div className="text-xs text-white/40">{label}</div>
    </div>
  );
}
