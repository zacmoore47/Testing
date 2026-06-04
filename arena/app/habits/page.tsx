import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import HabitsClient from "@/components/HabitsClient";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const habits = await prisma.habit.findMany({
    orderBy: [{ category: "asc" }, { points: "desc" }],
  });

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
      }))}
    />
  );
}
