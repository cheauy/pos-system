'use client';

import Link, { useLinkStatus } from 'next/link';
import { useEffect, type ComponentProps } from 'react';
import { activity } from '@/lib/ui/activity';

export function useActivity(pending: boolean) {
  useEffect(() => { if (pending) return activity.begin(); }, [pending]);
}

export function ActivitySignal() { useActivity(true); return null; }

function LinkActivity() {
  const { pending } = useLinkStatus();
  useActivity(pending);
  return null;
}

export default function ActivityLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<LinkActivity /></Link>;
}
