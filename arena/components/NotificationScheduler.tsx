"use client";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

interface Reminder {
  habitId: string;
  habitTitle: string;
  time: string;
  enabled: boolean;
  loggedToday: boolean;
}

// Polls /api/reminders every minute and fires a browser notification once
// per day when a habit's reminder time has passed and it's still unlogged.
export default function NotificationScheduler() {
  const { status } = useSession();
  const firedToday = useRef<Set<string>>(new Set());
  const lastDate = useRef<string>(new Date().toDateString());

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    async function check() {
      const today = new Date().toDateString();
      if (today !== lastDate.current) {
        firedToday.current = new Set();
        lastDate.current = today;
      }

      if (Notification.permission !== "granted") return;

      const res = await fetch("/api/reminders");
      if (!res.ok) return;
      const data = await res.json();
      const reminders: Reminder[] = data.reminders ?? [];

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      for (const r of reminders) {
        if (!r.enabled || r.loggedToday) continue;
        if (firedToday.current.has(r.habitId)) continue;
        const [h, m] = r.time.split(":").map(Number);
        if (nowMinutes < h * 60 + m) continue;

        new Notification("The Arena", { body: `Don't forget: ${r.habitTitle}` });
        firedToday.current.add(r.habitId);
      }
    }

    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [status]);

  return null;
}
