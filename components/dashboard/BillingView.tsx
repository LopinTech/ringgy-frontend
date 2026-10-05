'use client';

/**
 * Plan, usage, add-ons and invoices, all from the live billing API.
 *
 * Everything shown is what the customer pays or has used — never what a
 * call costs Ringgy. Payment itself happens on Stripe's pages (Checkout for
 * a first plan and one-time add-ons, the customer portal for the card and
 * billing details); this screen only starts those trips and shows the
 * result once the browser comes back.
 */

import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  ApiAccess,
  ApiAddOn,
  ApiAddOnPurchase,
  ApiAddOns,
  ApiBilling,
  ApiInvoice,
  ApiPlan,
  ApiPlanCatalogue,
  ApiSubscriptionStatus,
} from '@/lib/api-types';
import {
  BILLING_UNAVAILABLE,
  errorMessage,
  formatCents,
  formatDate,
  formatPerMinute,
  hasLivePlan,
  redirectTo,
} from '@/lib/billing';
import {
  Card,
  CardTitle,
  ConfirmDialog,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Tag,
} from './ui';
import { TrialSummary } from './TrialBanner';

interface BillingViewProps {
  billing: ApiBilling | null;
  /** Trial state, for the "current plan" card while on the free trial. */
  access?: ApiAccess | null;
  plans: ApiPlanCatalogue | null;
  invoices: ApiInvoice[];
  addOns: ApiAddOns | null;
  onChangePlan: (planId: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onResume: () => Promise<void>;
  /** Resolves to a Checkout url for one-time add-ons, null once a recurring one is added. */
  onPurchaseAddOn: (id: string) => Promise<string | null>;
  onCancelAddOn: (purchaseId: string) => Promise<void>;
}

const STATUS_TAGS: Record<
  ApiSubscriptionStatus,
  { label: string; tone: 'green' | 'blue' | 'grey' | 'amber' | 'red' }
> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  TRIALING: { label: 'Trial', tone: 'blue' },
  PAST_DUE: { label: 'Past due', tone: 'red' },
  UNPAID: { label: 'Unpaid', tone: 'red' },
  INCOMPLETE: { label: 'Awaiting payment', tone: 'amber' },
  INCOMPLETE_EXPIRED: { label: 'Expired', tone: 'grey' },
  CANCELED: { label: 'Canceled', tone: 'grey' },
  PAUSED: { label: 'Paused', tone: 'grey' },
};

/** What the confirm dialog is currently asking about. */
type Pending =
  | { kind: 'change'; plan: ApiPlan }
  | { kind: 'cancel' }
  | { kind: 'addon'; addOn: ApiAddOn }
  | { kind: 'cancel-addon'; purchase: ApiAddOnPurchase };

const minutes = (value: number) => `${Math.round(value).toLocaleString()} min`;

export const BillingView: React.FC<BillingViewProps> = ({
  billing,
  access = null,
  plans,
  invoices,
  addOns,
  onChangePlan,
  onCancel,
  onResume,
  onPurchaseAddOn,
  onCancelAddOn,
}) => {
  const [pending, setPending] = useState<Pending | null>(null);
  /** Id of the button whose Stripe redirect is in flight. */
  const [redirecting, setRedirecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabled = Boolean(billing?.billingEnabled);
  const live = hasLivePlan(billing);
  const subscription = billing?.subscription ?? null;
  const currentPlan = live ? subscription?.plan ?? null : null;
  const usage = billing?.usage ?? null;
  const planList = plans?.plans ?? [];

  /** Runs a call that ends in a redirect to Stripe, keeping its button busy until the page leaves. */
  const goToStripe = async (id: string, getUrl: () => Promise<string | null>) => {
    setRedirecting(id);
    setError(null);
    try {
      const url = await getUrl();
      if (url) {
        redirectTo(url);
        return;
      }
    } catch (caught) {
      setError(errorMessage(caught));
    }
    setRedirecting(null);
  };

  const checkout = (plan: ApiPlan) =>
    goToStripe(`plan:${plan.id}`, async () => {
      const { url } = await api.startCheckout(plan.id, '/?tab=billing&billing=success');
      return url;
    });

  const openPortal = () =>
    goToStripe('portal', async () => {
      const { url } = await api.billingPortal('/?tab=billing');
      return url;
    });

  const buyAddOn = (addOn: ApiAddOn) => {
    if (addOn.billingType === 'RECURRING') {
      setPending({ kind: 'addon', addOn });
      return;
    }
    void goToStripe(`addon:${addOn.id}`, () => onPurchaseAddOn(addOn.id));
  };

  const availableAddOns = (addOns?.available ?? []).filter(
    (addOn) => addOn.kind !== 'PHONE_NUMBER',
  );
  const activePurchases = (addOns?.purchases ?? []).filter(
    (purchase) =>
      purchase.status === 'ACTIVE' &&
      purchase.addOn.kind !== 'PHONE_NUMBER' &&
      // A spent minute pack has nothing left to show.
      !(purchase.addOn.kind === 'MINUTE_PACK' && (purchase.minutesRemaining ?? 0) <= 0),
  );

  if (!billing) {
    return (
      <Notice tone="amber" title="Billing could not be loaded">
        Try refreshing the page in a moment. Your receptionist keeps answering
        calls in the meantime.
      </Notice>
    );
  }

  return (
    <>
      {!enabled && <Notice tone="blue" title="Billing isn't set up on this server yet">
        Plans, add-ons and invoices appear here once it is. Your receptionist keeps working in the meantime.
      </Notice>}

      {error && (
        <Notice tone="amber" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      {subscription?.status === 'PAST_DUE' && (
        <Notice
          tone="red"
          title="Your last payment didn't go through"
          action={
            <SecondaryButton
              type="button"
              onClick={() => void openPortal()}
              disabled={!enabled || redirecting !== null}
            >
              Update payment method
            </SecondaryButton>
          }
        >
          Calls are still being answered. Update your card to keep your plan
          active.
        </Notice>
      )}

      {live && usage?.state === 'approaching' && (
        <Notice tone="amber" title="You're approaching your monthly limit.">
          {Math.round(usage.includedUsedMinutes).toLocaleString()} of{' '}
          {usage.includedMinutes.toLocaleString()} included minutes used this
          period
          {usage.packMinutesRemaining > 0
            ? `, plus ${minutes(usage.packMinutesRemaining)} left in your minute packs`
            : ''}
          .{' '}
          {usage.overageEnabled
            ? `After that, extra minutes are billed at ${formatPerMinute(usage.overageCentsPerMin)} — calls are never cut off.`
            : 'Calls are never cut off.'}
        </Notice>
      )}

      {live && usage?.state === 'exceeded' && (
        <Notice tone="red" title="You've used all your included minutes">
          {usage.overageEnabled
            ? `Overage billing has started at ${formatPerMinute(usage.overageCentsPerMin)}: ${minutes(usage.overageMinutes)} so far, about ${formatCents(usage.estimatedOverageCents)} on your next invoice. `
            : ''}
          Your receptionist keeps answering every call.
        </Notice>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-[18px]">
          <Card className="p-[22px]">
            {currentPlan && subscription ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <div className="text-xs font-bold tracking-[.08em] text-[#8A93A6] uppercase">
                        Current plan
                      </div>
                      <Tag tone={STATUS_TAGS[subscription.status].tone}>
                        {subscription.cancelAtPeriodEnd
                          ? 'Canceling'
                          : STATUS_TAGS[subscription.status].label}
                      </Tag>
                    </div>
                    <div className="mt-2 mb-1 text-[22px] font-extrabold">
                      {currentPlan.name} · {formatCents(currentPlan.priceCents)}/mo
                    </div>
                    <div className="text-[13px] text-[#6B7488]">
                      {subscription.cancelAtPeriodEnd
                        ? `Ends ${formatDate(subscription.currentPeriodEnd)} — you won't be charged again.`
                        : `Renews ${formatDate(subscription.currentPeriodEnd)}`}
                    </div>
                  </div>
                  {subscription.cancelAtPeriodEnd ? (
                    <PrimaryButton
                      type="button"
                      disabled={!enabled}
                      onClick={() =>
                        void onResume().catch((caught: unknown) =>
                          setError(errorMessage(caught)),
                        )
                      }
                    >
                      Keep my plan
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton
                      type="button"
                      disabled={!enabled}
                      onClick={() => setPending({ kind: 'cancel' })}
                    >
                      Cancel plan
                    </SecondaryButton>
                  )}
                </div>

                <div className="my-5 h-px bg-[#E4E8F0]" />

                {usage ? <UsagePanel usage={usage} /> : (
                  <p className="m-0 text-[13px] text-[#6B7488]">
                    Usage for this period appears after your first call.
                  </p>
                )}

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  <Fact
                    label="Extra minutes"
                    value={
                      currentPlan.overageEnabled
                        ? formatPerMinute(currentPlan.overageCentsPerMin)
                        : 'Not billed'
                    }
                  />
                  <Fact
                    label="Phone numbers"
                    value={`${billing.phoneNumbers.count} in use · ${currentPlan.includedPhoneNumbers} included${
                      billing.phoneNumbers.monthlyTotalCents > 0
                        ? ` · ${formatCents(billing.phoneNumbers.monthlyTotalCents)}/mo`
                        : ''
                    }`}
                  />
                </div>
              </>
            ) : access?.trial && access.trial.status !== 'CONVERTED' ? (
              <TrialSummary trial={access.trial} access={access} />
            ) : (
              <>
                <div className="text-xs font-bold tracking-[.08em] text-[#8A93A6] uppercase">
                  Current plan
                </div>
                <div className="mt-2 mb-1 text-[22px] font-extrabold">
                  No plan yet
                </div>
                <p className="m-0 text-[13px] leading-[1.5] text-[#6B7488]">
                  {subscription
                    ? `Your ${subscription.plan.name} plan is ${STATUS_TAGS[subscription.status].label.toLowerCase()}. `
                    : ''}
                  Choose a plan below to get a phone number or connect your
                  own phone system.
                  {billing.pricePerMinuteCents !== null &&
                    ` Extra minutes from ${formatPerMinute(billing.pricePerMinuteCents)}.`}
                </p>
              </>
            )}
          </Card>

          <Card className="p-[22px]">
            <CardTitle
              title={currentPlan ? 'Change plan' : 'Choose a plan'}
              hint="Billed monthly · cancel any time"
              className="mb-4"
            />
            {planList.length === 0 ? (
              <p className="m-0 text-[13px] text-[#6B7488]">
                No plans are available right now.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {planList.map((plan) => {
                  const isCurrent = currentPlan?.id === plan.id;
                  const busy = redirecting === `plan:${plan.id}`;
                  return (
                    <div
                      key={plan.id}
                      className={`flex flex-col rounded-[14px] border p-4 ${
                        isCurrent
                          ? 'border-[#2F6BFF] bg-[#F4F7FF]'
                          : plan.highlight
                            ? 'border-[#B9CCFF]'
                            : 'border-[#E4E8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[15px] font-extrabold">{plan.name}</div>
                        {isCurrent ? (
                          <Tag tone="blue">Current</Tag>
                        ) : plan.highlight ? (
                          <Tag tone="blue">Most popular</Tag>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[20px] font-extrabold">
                        {formatCents(plan.priceCents)}
                        <span className="text-[13px] font-semibold text-[#6B7488]">/mo</span>
                      </div>
                      <div className="mt-1 text-[12.5px] text-[#6B7488]">
                        {plan.includedMinutes.toLocaleString()} minutes included
                        {plan.overageEnabled &&
                          ` · extra minutes ${formatPerMinute(plan.overageCentsPerMin)}`}
                      </div>
                      {plan.features.length > 0 && (
                        <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-[12.5px] text-[#26304A]">
                          {plan.features.map((feature) => (
                            <li key={feature} className="flex gap-2">
                              <span className="text-[#2F6BFF]">✓</span>
                              {feature}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-auto pt-4">
                        {isCurrent ? null : currentPlan ? (
                          <SecondaryButton
                            type="button"
                            className="w-full"
                            disabled={!enabled}
                            onClick={() => setPending({ kind: 'change', plan })}
                          >
                            Switch to {plan.name}
                          </SecondaryButton>
                        ) : (
                          <PrimaryButton
                            type="button"
                            className="w-full"
                            disabled={!enabled || redirecting !== null}
                            title={enabled ? undefined : BILLING_UNAVAILABLE}
                            onClick={() => void checkout(plan)}
                          >
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                            Choose {plan.name}
                          </PrimaryButton>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-[#E4E8F0] px-[22px] py-[18px] text-[14.5px] font-bold">
              Invoices
            </div>
            {invoices.length === 0 ? (
              <p className="m-0 px-[22px] py-5 text-[13px] text-[#6B7488]">
                No invoices yet.
              </p>
            ) : (
              invoices.map((invoice, index) => (
                <div
                  key={invoice.id}
                  className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-[22px] py-3.5 ${
                    index === invoices.length - 1 ? '' : 'border-b border-[#E4E8F0]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold">
                      {formatDate(invoice.createdAt)}
                    </div>
                    {invoice.number && (
                      <div className="text-[12px] text-[#8A93A6]">{invoice.number}</div>
                    )}
                  </div>
                  <div className="text-[13.5px] font-bold">
                    {formatCents(invoice.totalCents, invoice.currency)}
                  </div>
                  <Tag tone={invoice.status === 'paid' ? 'green' : invoice.status === 'open' ? 'amber' : 'grey'}>
                    {invoice.status ? invoice.status[0].toUpperCase() + invoice.status.slice(1) : '—'}
                  </Tag>
                  <div className="flex gap-3 text-[12.5px] font-bold">
                    {invoice.hostedUrl && (
                      <a href={invoice.hostedUrl} target="_blank" rel="noreferrer" className="text-[#2F6BFF] hover:underline">
                        View
                      </a>
                    )}
                    {invoice.pdfUrl && (
                      <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-[#2F6BFF] hover:underline">
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-[18px]">
          <Card className="p-[22px]">
            <CardTitle title="Payment method & billing details" className="mb-2" />
            <p className="m-0 text-[13px] leading-[1.5] text-[#6B7488]">
              Your card, billing address and receipts are managed securely by
              Stripe.
            </p>
            <SecondaryButton
              type="button"
              className="mt-3.5 w-full"
              disabled={!enabled || !subscription || redirecting !== null}
              title={subscription ? undefined : 'Choose a plan first'}
              onClick={() => void openPortal()}
            >
              {redirecting === 'portal' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage payment method & billing details
            </SecondaryButton>
          </Card>

          <Card className="p-[22px]">
            <CardTitle title="Add-ons" className="mb-3.5" />

            {activePurchases.length > 0 && (
              <div className="mb-4 flex flex-col gap-2">
                {activePurchases.map((purchase) => (
                  <div
                    key={purchase.id}
                    className="flex items-center gap-3 rounded-[12px] border border-[#E4E8F0] bg-[#F8FAFF] px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">
                        {purchase.addOn.name}
                        {purchase.quantity > 1 && ` × ${purchase.quantity}`}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-[#6B7488]">
                        {purchase.addOn.kind === 'MINUTE_PACK'
                          ? `${minutes(purchase.minutesRemaining ?? 0)} of ${minutes(purchase.minutesGranted ?? 0)} left`
                          : purchase.addOn.billingType === 'RECURRING'
                            ? `${formatCents(purchase.unitPriceCents * purchase.quantity)}/mo`
                            : `Purchased ${formatDate(purchase.createdAt)}`}
                      </div>
                    </div>
                    {purchase.addOn.billingType === 'RECURRING' && (
                      <SecondaryButton
                        type="button"
                        disabled={!enabled}
                        onClick={() => setPending({ kind: 'cancel-addon', purchase })}
                      >
                        Cancel
                      </SecondaryButton>
                    )}
                  </div>
                ))}
              </div>
            )}

            {availableAddOns.length === 0 ? (
              <p className="m-0 text-[13px] text-[#6B7488]">
                No add-ons are available right now.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {availableAddOns.map((addOn) => (
                  <div
                    key={addOn.id}
                    className="flex items-center gap-3 rounded-[12px] border border-[#E4E8F0] px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold">{addOn.name}</div>
                      <div className="mt-0.5 text-[12.5px] leading-[1.45] text-[#6B7488]">
                        {addOn.description ??
                          (addOn.minutes ? `${minutes(addOn.minutes)} prepaid` : '')}
                      </div>
                    </div>
                    <SecondaryButton
                      type="button"
                      disabled={!enabled || !live || redirecting !== null}
                      title={live ? undefined : 'Choose a plan first'}
                      onClick={() => buyAddOn(addOn)}
                    >
                      {redirecting === `addon:${addOn.id}` && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      {formatCents(addOn.priceCents)}
                      {addOn.billingType === 'RECURRING' ? '/mo' : ''}
                    </SecondaryButton>
                  </div>
                ))}
              </div>
            )}
            {!live && availableAddOns.length > 0 && (
              <p className="m-0 mt-3 text-[12px] text-[#8A93A6]">
                Add-ons can be bought once you have a plan.
              </p>
            )}
          </Card>
        </div>
      </div>

      {pending?.kind === 'change' && (
        <ConfirmDialog
          title={`Switch to ${pending.plan.name}?`}
          confirmLabel={`Switch to ${pending.plan.name}`}
          onClose={() => setPending(null)}
          onConfirm={() => onChangePlan(pending.plan.id)}
        >
          Your plan becomes {pending.plan.name} at{' '}
          {formatCents(pending.plan.priceCents)}/mo with{' '}
          {pending.plan.includedMinutes.toLocaleString()} included minutes,
          starting now. The difference for the rest of this period is
          prorated on your next invoice.
        </ConfirmDialog>
      )}

      {pending?.kind === 'cancel' && subscription && (
        <ConfirmDialog
          title="Cancel your plan?"
          confirmLabel="Cancel plan"
          danger
          onClose={() => setPending(null)}
          onConfirm={onCancel}
        >
          Your plan stays active until {formatDate(subscription.currentPeriodEnd)}{' '}
          and you won&apos;t be charged again. You can change your mind any
          time before then.
        </ConfirmDialog>
      )}

      {pending?.kind === 'addon' && (
        <ConfirmDialog
          title={`Add ${pending.addOn.name}?`}
          confirmLabel={`Add for ${formatCents(pending.addOn.priceCents)}/mo`}
          onClose={() => setPending(null)}
          onConfirm={async () => {
            await onPurchaseAddOn(pending.addOn.id);
          }}
        >
          {formatCents(pending.addOn.priceCents)}/mo is added to your plan
          straight away and billed with your subscription. You can cancel it
          any time.
        </ConfirmDialog>
      )}

      {pending?.kind === 'cancel-addon' && (
        <ConfirmDialog
          title={`Cancel ${pending.purchase.addOn.name}?`}
          confirmLabel="Cancel add-on"
          danger
          onClose={() => setPending(null)}
          onConfirm={() => onCancelAddOn(pending.purchase.id)}
        >
          It is removed from your subscription and you won&apos;t be billed
          for it again.
        </ConfirmDialog>
      )}
    </>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-[12px] border border-[#E4E8F0] bg-[#F8FAFF] px-3.5 py-3">
    <div className="text-[12px] font-semibold text-[#8A93A6]">{label}</div>
    <div className="mt-0.5 text-[13.5px] font-bold">{value}</div>
  </div>
);

/** Included minutes as a bar, then what is left in packs and what has gone to overage. */
const UsagePanel: React.FC<{ usage: NonNullable<ApiBilling['usage']> }> = ({ usage }) => {
  const color =
    usage.state === 'exceeded'
      ? 'bg-[#D8453B]'
      : usage.state === 'approaching'
        ? 'bg-[#E59A1F]'
        : 'bg-[#2F6BFF]';

  return (
    <div>
      <div className="mb-[7px] flex flex-wrap justify-between gap-2 text-[13px]">
        <span className="font-bold">Included minutes</span>
        <span className="text-[#6B7488]">
          {minutes(usage.includedUsedMinutes)} of {minutes(usage.includedMinutes)}
        </span>
      </div>
      <div className="h-[7px] overflow-hidden rounded-full bg-[#EEF0F5]">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, usage.percentOfIncluded))}%` }}
        />
      </div>
      <div className="mt-2 text-[12px] text-[#8A93A6]">
        {formatDate(usage.periodStart)} – {formatDate(usage.periodEnd)} ·{' '}
        {minutes(usage.usedMinutes)} used in total
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <Fact
          label="Minute packs remaining"
          value={minutes(usage.packMinutesRemaining)}
        />
        <Fact
          label="Overage this period"
          value={
            usage.overageMinutes > 0
              ? `${minutes(usage.overageMinutes)} · ≈ ${formatCents(usage.estimatedOverageCents)}`
              : 'None'
          }
        />
      </div>
    </div>
  );
};
