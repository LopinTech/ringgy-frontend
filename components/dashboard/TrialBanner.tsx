'use client';

/**
 * Everything the customer is told about their free trial, from the first
 * day to the last day the dashboard can be opened. The dates all come from
 * the server (GET /me/access) and were fixed when the trial started, so
 * what is shown here is exactly what will happen.
 *
 *   trial      → days and minutes left, upgrade any time
 *   grace      → trial over, calls still answered until a date
 *   suspended  → live answering stopped, read-only until a date, numbers
 *                released on a date
 *   expired    → only upgrading is offered (LockedScreen)
 */

import React from 'react';
import { Lock, PhoneOff } from 'lucide-react';
import type { ApiAccess, ApiTrial } from '@/lib/api-types';
import { formatDate, formatE164 } from '@/lib/billing';
import { Card, Notice, PrimaryButton } from './ui';

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

function numbersPhrase(numbers: string[]): string {
  if (numbers.length === 0) return 'your trial number';
  return numbers.map(formatE164).join(', ');
}

/** The release sentence, or null when nothing is going to be released. */
function releaseSentence(access: ApiAccess): string | null {
  const trial = access.trial;
  if (!trial?.numberReleaseAt || trial.numbersReleasedAt) return null;
  if (access.numbersAtRisk.length === 0) return null;
  return `${numbersPhrase(access.numbersAtRisk)} will be released on ${formatDate(trial.numberReleaseAt)} unless you choose a plan.`;
}

export const ServiceAccessBanner: React.FC<{
  access: ApiAccess | null;
  onUpgrade: () => void;
}> = ({ access, onUpgrade }) => {
  const trial = access?.trial;
  if (!access || !trial || trial.status === 'CONVERTED') {
    if (access?.mode === 'lapsed') {
      return (
        <Notice
          tone="red"
          title="Live call answering has stopped"
          action={<UpgradeButton onClick={onUpgrade} label="Choose a plan" />}
        >
          {access.answeringStoppedReason} Your call history and settings are
          kept, and your dashboard is read-only until then.
        </Notice>
      );
    }
    return null;
  }

  const upgrade = <UpgradeButton onClick={onUpgrade} />;

  if (access.mode === 'trial') {
    if (trial.minutesExhausted && trial.stopAtMinuteLimit) {
      return (
        <Notice
          tone="red"
          title="Your free minutes are used up — calls are no longer being answered"
          action={upgrade}
        >
          You used all {trial.includedMinutes} trial minutes. Choose a plan to
          turn your AI receptionist back on straight away. Nothing has been
          charged.
        </Notice>
      );
    }
    return (
      <Notice
        tone={trial.endingSoon ? 'amber' : 'blue'}
        title={
          trial.daysLeft <= 0
            ? 'Your free trial ends today'
            : `Free trial · ${plural(trial.daysLeft, 'day')} left`
        }
        action={upgrade}
      >
        Ends {formatDate(trial.endsAt)} · {trial.usedMinutes} of{' '}
        {trial.includedMinutes} free minutes used. No card on file — you
        won&apos;t be charged when it ends. Upgrade any time to keep your
        receptionist answering.
      </Notice>
    );
  }

  if (access.mode === 'grace') {
    return (
      <Notice
        tone="amber"
        title={`Your free trial has ended — calls are answered until ${formatDate(trial.graceEndsAt)}`}
        action={upgrade}
      >
        {trial.minutesExhausted && trial.stopAtMinuteLimit
          ? 'Your free minutes are used up, so calls are not being answered now. '
          : `This is your grace period: your AI receptionist keeps answering until ${formatDate(trial.graceEndsAt)}, then live call answering stops. `}
        Nothing is charged automatically — choose a plan to keep going.
      </Notice>
    );
  }

  if (access.mode === 'suspended') {
    const release = releaseSentence(access);
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#F3C5C1] bg-[#FDF3F2] px-[22px] py-5">
        <PhoneOff className="h-5 w-5 flex-none text-[#B3261E]" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold text-[#8E2A24]">
            Live call answering has stopped
          </div>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-[#8E2A24]">
            Your free trial ended on {formatDate(trial.endsAt)} and your AI
            receptionist stopped answering on {formatDate(trial.graceEndsAt)}.
            Your calls, appointments and settings are saved — you can view them
            here, read-only, until {formatDate(trial.readOnlyEndsAt)}.
            {release ? ` ${release}` : ''}
            {trial.numbersReleasedAt
              ? ' Your trial number has been released; choosing a plan gets it back if it is still free, or lets you pick a new one.'
              : ''}
          </p>
        </div>
        {upgrade}
      </div>
    );
  }

  return null;
};

const UpgradeButton: React.FC<{ onClick: () => void; label?: string }> = ({
  onClick,
  label = 'Upgrade',
}) => (
  <PrimaryButton type="button" onClick={onClick}>
    {label}
  </PrimaryButton>
);

/** The "current plan" card on the billing page while on the trial. */
export const TrialSummary: React.FC<{ trial: ApiTrial; access: ApiAccess }> = ({
  trial,
  access,
}) => {
  const percent =
    trial.includedMinutes > 0
      ? Math.min(100, Math.round((trial.usedMinutes / trial.includedMinutes) * 100))
      : 100;
  const over = trial.status !== 'ACTIVE';
  return (
    <>
      <div className="text-xs font-bold tracking-[.08em] text-[#8A93A6] uppercase">
        Current plan
      </div>
      <div className="mt-2 mb-1 text-[22px] font-extrabold">
        {over ? 'Free trial ended' : 'Free trial'}
      </div>
      <p className="m-0 text-[13px] leading-[1.5] text-[#6B7488]">
        {over
          ? `Ended ${formatDate(trial.endsAt)}. `
          : `${plural(trial.daysLeft, 'day')} left · ends ${formatDate(trial.endsAt)}. `}
        No card on file and nothing is charged automatically. Choose a plan
        below whenever you&apos;re ready — it starts straight away.
      </p>
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[12.5px] font-semibold">
          <span>Free minutes</span>
          <span className="text-[#6B7488]">
            {trial.usedMinutes} of {trial.includedMinutes} used
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#EEF1F6]">
          <div
            className={`h-full rounded-full ${trial.minutesExhausted ? 'bg-[#D93A2F]' : 'bg-[#2F6BFF]'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <dl className="mt-4 grid gap-1.5 text-[12.5px] text-[#6B7488]">
        <div>
          Phone numbers on the trial: {trial.maxPhoneNumbers}
          {access.trialNumbersRemaining !== null &&
            trial.status === 'ACTIVE' &&
            ` (${access.trialNumbersRemaining} left)`}
        </div>
        <div>
          {trial.status === 'ACTIVE' || trial.status === 'GRACE'
            ? `If you don't upgrade: calls are answered until ${formatDate(trial.graceEndsAt)}, the dashboard stays viewable until ${formatDate(trial.readOnlyEndsAt)}`
            : trial.status === 'SUSPENDED'
              ? `Live call answering stopped on ${formatDate(trial.graceEndsAt)}. The dashboard stays viewable until ${formatDate(trial.readOnlyEndsAt)}`
              : `Live call answering stopped on ${formatDate(trial.graceEndsAt)}, and read-only access ended on ${formatDate(trial.readOnlyEndsAt)}`}
          {trial.numbersReleasedAt
            ? `; trial numbers were released on ${formatDate(trial.numbersReleasedAt)}.`
            : trial.numberReleaseAt
              ? `, and trial numbers are released on ${formatDate(trial.numberReleaseAt)}.`
              : '.'}
        </div>
      </dl>
    </>
  );
};

/** Shown instead of the dashboard once the read-only window has closed. */
export const LockedScreen: React.FC<{
  access: ApiAccess;
  onUpgrade: () => void;
}> = ({ access, onUpgrade }) => (
  <Card className="mx-auto max-w-[560px] p-8 text-center">
    <Lock className="mx-auto h-8 w-8 text-[#6B7488]" />
    <h2 className="mt-4 text-[20px] font-extrabold">
      Your free trial has ended
    </h2>
    <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-[#6B7488]">
      Live call answering stopped on{' '}
      {formatDate(access.trial?.graceEndsAt)}, and read-only access to your
      dashboard ended on {formatDate(access.trial?.readOnlyEndsAt)}. Choose a
      plan to reactivate Ringgy — your business profile and assistant
      configuration are still here and come back as they were.
      {access.trial?.numbersReleasedAt &&
        ' Your trial number was released; we will get it back if it is still free, or you can pick a new one.'}
    </p>
    <PrimaryButton type="button" className="mt-5" onClick={onUpgrade}>
      Choose a plan
    </PrimaryButton>
  </Card>
);
