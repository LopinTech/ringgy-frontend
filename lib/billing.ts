/**
 * Small helpers shared by the billing, phone and onboarding screens. They
 * read the backend's billing shapes directly: there is no second UI model
 * for billing, so there is nothing for `lib/mappers.ts` to translate.
 */

import { ApiError } from './api';
import type { ApiBilling, ApiSubscriptionStatus } from './api-types';

/** The statuses under which the tenant has a plan they can use. */
const LIVE_STATUSES: ApiSubscriptionStatus[] = ['ACTIVE', 'TRIALING', 'PAST_DUE'];

export function hasLivePlan(billing: ApiBilling | null | undefined): boolean {
  const status = billing?.subscription?.status;
  return Boolean(status && LIVE_STATUSES.includes(status));
}

/** A 503 from any billing endpoint means the server has no Stripe key yet. */
export function isBillingUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 503;
}

export const BILLING_UNAVAILABLE =
  "Billing isn't set up on this server yet. Your receptionist keeps working — plans can be chosen once it is.";

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (isBillingUnavailable(error)) return BILLING_UNAVAILABLE;
  return error instanceof Error ? error.message : fallback;
}

/** 4900 -> "$49", 4950 -> "$49.50". */
export function formatCents(cents: number, currency = 'usd'): string {
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** A decimal number of cents per minute: 12 -> "$0.12/min", 0.35 -> "$0.0035/min". */
export function formatPerMinute(centsPerMin: number): string {
  const dollars = (centsPerMin / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return `${dollars}/min`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "+15125550123" -> "(512) 555-0123"; masked or foreign numbers are left alone. */
export function formatE164(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

/**
 * Sends the browser to a Stripe-hosted page. A full navigation, not the
 * router: Checkout and the portal live on Stripe's origin.
 */
export function redirectTo(url: string): void {
  window.location.assign(url);
}
