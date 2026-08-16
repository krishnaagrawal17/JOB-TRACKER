import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

// 400 is required: the body / body-sm / caption type scale is all fontWeight 400, and
// without it the browser silently substitutes 500 for every line of body copy.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' });

export const metadata: Metadata = {
  title: 'Job Tracker',
  description: 'A personal job application tracker.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} bg-canvas font-sans text-ink antialiased`}>
        <header className="flex h-14 items-center gap-lg border-b border-hairline bg-canvas px-lg">
          <nav className="flex gap-md text-body-sm">
            <Link href="/" className="text-ink hover:text-accent-hover">
              Board
            </Link>
            <Link href="/profile" className="text-ink-muted hover:text-accent-hover">
              Profile
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
