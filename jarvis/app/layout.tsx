import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Link from "next/link";
import { LayoutDashboard, BookOpen, BarChart2, Settings, Rocket, ListTodo } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Jarvis — Life Optimization Dashboard",
  description: "Track every dimension of your performance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-100 antialiased min-h-screen`}>
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-14">
            <Link href="/" className="font-bold text-lg tracking-tight text-zinc-100">
              <span className="text-blue-400">J</span>arvis
            </Link>
            <div className="flex items-center gap-1">
              <NavLink href="/" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" />
              <NavLink href="/log" icon={<BookOpen className="h-4 w-4" />} label="Log" />
              <NavLink href="/projects" icon={<Rocket className="h-4 w-4" />} label="Projects" />
              <NavLink href="/tasks" icon={<ListTodo className="h-4 w-4" />} label="Tasks" />
              <NavLink href="/review" icon={<BarChart2 className="h-4 w-4" />} label="Review" />
              <NavLink href="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" />
            </div>
          </div>
        </nav>

        <main className="mx-auto max-w-7xl px-4 py-6">
          {children}
        </main>

        <Toaster theme="dark" position="bottom-right" richColors />
      </body>
    </html>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
