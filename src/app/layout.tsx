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
    <header className="sticky top-0 z-10 nb-topbar">
      <div className="nb-topbar-inner max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5 sm:gap-8">
          <Link
            href="/"
            className="flex items-center gap-2"
            aria-label="Enablement Do-er"
          >
            <span className="nb-brand-mark" aria-hidden>✦</span>
            <span className="nb-brand-name">Enablement Do-er</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="nb-nav-link"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <Link
          href="/requests/new"
          className="nb-button nb-button-primary shrink-0"
        >
          + New Request
        </Link>
      </div>
    </header>
  )
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="neobrutalism">
      <body className="min-h-screen antialiased">
        <TopNav />
        <main className="nb-page max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
