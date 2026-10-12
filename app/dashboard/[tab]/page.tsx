import { DashboardTabView } from '@/components/dashboard/DashboardTabView';

/**
 * No validation here: `redirect()` from this Server Component does not
 * reliably produce an HTTP redirect, because its parent (app/dashboard/
 * layout.tsx) is a Client Component whose own render can — depending on
 * auth/loading state — choose not to include `{children}` in its output,
 * which silently drops a thrown-but-unused redirect along with it. The
 * layout validates `tab` client-side instead (same pattern as its auth
 * guard), and DashboardTabView's `default: return null` covers the brief
 * moment before that redirect lands.
 */
export default async function DashboardTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  return <DashboardTabView tab={tab} />;
}
