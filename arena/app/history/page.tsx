import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import HistoryClient from "@/components/HistoryClient";

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

  const data = logs.map((l) => ({
    id: l.id,
    date: l.date.toISOString(),
    pointsEarned: l.pointsEarned,
    habitTitle: l.habit.title,
    category: l.habit.category as string,
  }));

  return <HistoryClient logs={data} />;
}
