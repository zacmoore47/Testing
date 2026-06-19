import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import HabitsClient from "@/components/HabitsClient";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = (session.user as any).id as string;

  const habits = await prisma.habit.findMany({
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

  const reminders = await prisma.habitReminder.findMany({ where: { userId } });
  const reminderMap = new Map(reminders.map((r) => [r.habitId, r]));

  return (
    <HabitsClient
      initialHabits={habits.map((h) => ({
        id: h.id,
        title: h.title,
        category: h.category as string,
        points: h.points,
        type: h.type as string,
        frequency: h.frequency as string,
        unit: h.unit,
        minValue: h.minValue,
        maxPoints: h.maxPoints,
        description: h.description,
        isActive: h.isActive,
        reminderEnabled: reminderMap.get(h.id)?.enabled ?? false,
        reminderTime: reminderMap.get(h.id)?.time ?? "09:00",
      }))}
    />
  );
}
