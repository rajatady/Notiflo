import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const navItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    testId: 'nav-dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    label: 'Alerts',
    href: '/alerts',
    testId: 'nav-alerts',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
  },
  {
    label: 'Notifications',
    href: '/notifications',
    testId: 'nav-notifications',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const router = useRouter();

  return (
    <aside className="bg-surface border-r border-border w-[240px] min-h-screen flex flex-col">
      {/* Brand */}
      <div className="px-5 pt-6 pb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center shadow-glow-cyan">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neon-cyan">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-text-primary">
            Notiflo
          </span>
        </div>
        <p className="text-[10px] font-mono text-text-muted mt-2 tracking-widest uppercase">
          Evaluation Engine
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-3 flex-1">
        {navItems.map((item) => {
          const isActive = router.pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <span
                data-testid={item.testId}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all duration-150 ${
                  isActive
                    ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 shadow-glow-cyan'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated border border-transparent'
                }`}
              >
                <span className={isActive ? 'text-neon-cyan' : 'text-text-muted'}>
                  {item.icon}
                </span>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Engine indicator */}
      <div className="px-5 py-4 border-t border-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-green animate-glow-pulse" />
          <span className="text-[11px] font-mono text-text-muted">Rust Engine</span>
        </div>
      </div>
    </aside>
  );
}
