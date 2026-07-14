import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

// NOTE: no next/font here — its build-time font fetch fails inside the
// Spark Docker build. System font stack via globals.css instead.

export const metadata: Metadata = {
  title: 'Enablement Do-er',
  description:
    'Autonomous agent for reactive training requests — assessed against the Design to Impact Spine',
}

function TopNav() {
  const links = [
    { href: '/requests', label: 'Requests' },
    { href: '/queue', label: 'Queue' },
  ]
  return (
    <header className="sticky top-0 z-10 border-b border-charcoal-700 bg-charcoal-1000/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity"
            aria-label="Enablement Do-er"
          >
            <span
              className="inline-block w-6 h-6 rounded-3 bg-gradient-to-br from-ac-blue-600 to-ac-blue-800"
              aria-hidden
            />
            <span className="text-sm font-semibold tracking-tight text-midnight-white">
              Enablement Do-er
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="px-3 py-1.5 rounded-2 text-charcoal-300 hover:text-midnight-white hover:bg-charcoal-800 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/requests/new"
          className="text-sm bg-ac-blue-700 hover:bg-ac-blue-600 text-midnight-white px-3 py-1.5 rounded-2 font-medium transition-colors"
        >
          + New Request
        </Link>
      </div>
    </header>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body className="bg-charcoal-1000 text-midnight-white min-h-screen antialiased">
        <TopNav />
        <main className="relative z-10 max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
