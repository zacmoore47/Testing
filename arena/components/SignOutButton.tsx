"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="w-full bg-white/5 border border-white/10 rounded-xl py-3 text-white/50 text-sm hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition"
    >
      Sign Out
    </button>
  );
}
