import type { Metadata } from "next";
import "./globals.css";
import { SessionProvider } from "@/components/SessionProvider";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "The Arena",
  description: "Two-player self-improvement competition",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f0f0f] text-white">
        <SessionProvider session={session}>
          {session && <Nav />}
          <main className="max-w-2xl mx-auto px-4 pb-24 pt-4">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
