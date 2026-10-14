'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { PAGES } from '@/components/dashboard/pages';

/**
 * The app's single public entry point. Dashboard sections now have their
 * own URLs (see app/dashboard/), but a few things still land here with
 * query params from before that was true: Stripe's hard-coded cancel-path
 * default (`subscription.service.ts`), an add-on checkout that doesn't pass
 * a custom path, and any stale `?tab=` link. So rather than assuming every
 * caller has been updated to link straight to a /dashboard/<tab> route,
 * this resolves the right one and forwards whatever query params are still
 * attached (`session_id`, `billing`, `addon`, `trial`, `setup`) so the
 * dashboard layout's one-shot checkout/trial handling still sees them.
 *
 * Read from `window.location` rather than `useSearchParams`, to avoid a
 * Suspense boundary around this page just to read a query once.
 */
function resolveDashboardPath(): string {
  const params = new URLSearchParams(window.location.search);
  const setupNumber = params.get('setup') === 'number';
  const tabParam = params.get('tab');
  const billing = params.get('billing');
  const addon = params.get('addon');

  const tab = setupNumber
    ? 'phone'
    : tabParam && PAGES.some((page) => page.id === tabParam)
      ? tabParam
      : billing || addon
        ? 'billing'
        : 'overview';

  // `tab` is now encoded in the path; everything else rides along as-is.
  params.delete('tab');
  const qs = params.toString();
  return `/dashboard/${tab}${qs ? `?${qs}` : ''}`;
}

export default function RootPage() {
  const router = useRouter();
  const { session, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    router.replace(session ? resolveDashboardPath() : '/login');
  }, [isLoading, session, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F2F4F8]">
      <Loader2 className="h-5 w-5 animate-spin text-[#2F6BFF]" />
    </div>
  );
}
