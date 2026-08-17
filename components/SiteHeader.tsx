'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SiteHeader() {
  const pathname = usePathname();
  if (pathname === '/login') return null;

  return (
    <header className="flex h-14 items-center gap-lg border-b border-hairline bg-canvas px-lg">
      <nav className="flex gap-md text-body-sm">
        <Link href="/" className="text-ink hover:text-accent-hover">
          Board
        </Link>
        <Link href="/profile" className="text-ink-muted hover:text-accent-hover">
          Profile
        </Link>
      </nav>
      <form action="/api/auth/logout" method="post" className="ml-auto">
        <button type="submit" className="text-body-sm text-ink-muted hover:text-accent-hover">
          Log out
        </button>
      </form>
    </header>
  );
}
