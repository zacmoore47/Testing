"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export default function Nav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user as any;

  const links = [
    { href: "/", label: "🏟️", title: "Arena" },
    { href: "/log", label: "✅", title: "Log" },
    { href: "/history", label: "📅", title: "History" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a1a] border-t border-white/10">
      <div className="max-w-2xl mx-auto flex items-center justify-around px-4 py-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-0.5 text-xs transition-colors ${
              pathname === l.href ? "text-yellow-400" : "text-white/50 hover:text-white/80"
            }`}
          >
            <span className="text-xl">{l.label}</span>
            <span>{l.title}</span>
          </Link>
        ))}
        {user && (
          <Link
            href="/profile"
            className={`flex flex-col items-center gap-0.5 text-xs transition-colors ${
              pathname === "/profile" ? "text-yellow-400" : "text-white/50 hover:text-white/80"
            }`}
          >
            <span className="text-xl">{user.emoji ?? "👤"}</span>
            <span>{user.name?.split(" ")[0]}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
