import type { Metadata } from 'next'
import './globals.css'
import Link from 'next/link'
import { Settings, BarChart2, Home } from 'lucide-react'

export const metadata: Metadata = {
  title: 'AI Cold Outreach',
  description: 'AI-powered cold email outreach tool',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50">
          <nav className="border-b bg-white px-6 py-3">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2 font-semibold text-gray-900">
                  <BarChart2 className="h-5 w-5 text-blue-600" />
                  <span>AI Outreach</span>
                </Link>
                <div className="flex items-center gap-4">
                  <Link
                    href="/"
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <Home className="h-4 w-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </div>
              </div>
            </div>
          </nav>
          <main className="mx-auto max-w-7xl p-6">{children}</main>
        </div>
      </body>
    </html>
  )
}
