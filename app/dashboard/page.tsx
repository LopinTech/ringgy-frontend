/**
 * No server redirect() here: this page is nested under app/dashboard/
 * layout.tsx, a Client Component, and a server redirect() thrown by a
 * nested page does not reliably produce an HTTP redirect when its parent
 * layout is one. The layout redirects bare "/dashboard" to
 * "/dashboard/overview" client-side instead (same guard that handles an
 * unknown tab).
 */
export default function DashboardIndexPage() {
  return null;
}
