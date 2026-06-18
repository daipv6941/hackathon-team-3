'use client';

import { createFileRoute, Link, Outlet, useLocation } from '@tanstack/react-router';
import { BarChart3, FileText, Users } from 'lucide-react';

// Hiring module routes. Parent /_authed already enforces session existence.
export const Route = createFileRoute('/_authed/hiring')({
  component: HiringLayout,
});

function HiringLayout() {
  const location = useLocation();

  const menuItems = [
    {
      label: 'Chat',
      href: '/hiring/chat',
      icon: FileText,
      description: 'Draft JD & Screen Candidates',
    },
    {
      label: 'Requests',
      href: '/hiring/requests',
      icon: BarChart3,
      description: 'Manage Hiring Requests',
    },
    {
      label: 'Candidates',
      href: '/hiring/candidates',
      icon: Users,
      description: 'Candidate Pool',
    },
  ];

  const isActive = (href: string) => location.pathname === href;

  return (
    <div className="flex min-h-screen gap-6 p-6">
      {/* Sidebar Menu */}
      <div className="w-56 flex-shrink-0">
        <div className="space-y-2">
          <h2 className="px-4 py-2 text-lg font-bold">Hiring Studio</h2>
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-start gap-3 rounded-lg px-4 py-3 transition ${
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-surface-2'
                }`}
              >
                <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <div
                    className={`text-sm font-semibold ${active ? 'text-primary-foreground' : ''}`}
                  >
                    {item.label}
                  </div>
                  <div
                    className={`text-xs ${active ? 'text-primary-foreground/80' : 'text-ink-subtle'}`}
                  >
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
