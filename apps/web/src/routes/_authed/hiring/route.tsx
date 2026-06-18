'use client';

import { createFileRoute, Outlet } from '@tanstack/react-router';

// Hiring module routes. Parent /_authed already enforces session existence.
export const Route = createFileRoute('/_authed/hiring')({
  component: HiringLayout,
});

function HiringLayout() {
  return <Outlet />;
}
