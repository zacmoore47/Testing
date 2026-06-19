import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stock Arena — AI Trading Debate",
  description: "AI agents debate stocks from opposing perspectives",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geistMono.variable} antialiased`}>
      <body className="min-h-screen flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-900/90 text-amber-200 text-center text-xs py-1.5 px-4 backdrop-blur-sm border-b border-amber-800/50">
          Educational tool only — not financial advice. Do your own research before making investment decisions.
        </div>
        <main className="flex-1 pt-8">{children}</main>
      </body>
    </html>
  );
}
