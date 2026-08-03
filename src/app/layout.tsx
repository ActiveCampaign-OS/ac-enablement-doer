import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { PixelStudio } from './PixelStudio'
import { isOperatorEmail } from '@/lib/permissions'
import './globals.css'

// NOTE: no next/font here — its build-time font fetch fails inside the
// Spark Docker build. System font stack via globals.css instead.

export const metadata: Metadata = {
  title: 'Enablement Do-er',
  description:
    'Support-needs intake and Enablement routing agent assessed against the Design to Impact Spine',
}

async function TopNav() {
  const h = await headers()
  const email = (h.get('x-auth-request-email') || h.get('cf-access-authenticated-user-email') || '').trim().toLowerCase()
  const links = [
    { href: '/requests', label: 'Requests' },
    ...(email && isOperatorEmail(email).isOperator ? [{ href: '/queue', label: 'Queue' }] : []),
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
        <main className="nb-page relative z-10 max-w-7xl mx-auto px-4 py-8">{children}</main>
        <PixelStudio />
      </body>
    </html>
  )
}
