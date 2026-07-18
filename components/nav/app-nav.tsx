'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tools = [
  { label: 'Size Checker', href: '/size-checker' },
  { label: 'Ups Calculator', href: '/ups-calculator' },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-border bg-background">
      <div className="max-w-screen-xl mx-auto px-4 flex items-center gap-6 h-14">
        <Link href="/" className="font-semibold text-foreground tracking-tight hover:opacity-75 transition-opacity">
          Fastroll
        </Link>
        <div className="flex items-center gap-1">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm transition-colors',
                pathname === tool.href
                  ? 'bg-muted text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              {tool.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
