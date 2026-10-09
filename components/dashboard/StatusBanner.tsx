'use client';

/**
 * The one banner the overview always leads with: whether calls are actually
 * being answered right now. It keeps the three states the old banner had —
 * setup incomplete, paused, live — in the new flat style.
 */

import React from 'react';
import { AlertTriangle, CheckCircle2, Pause, Play } from 'lucide-react';
import type { TenantConfig, TenantStatus } from '@/types/schema';
import type { ApiBilling } from '@/lib/api-types';
import { formatPerMinute, hasLivePlan } from '@/lib/billing';
import { Notice, PrimaryButton, SecondaryButton } from './ui';

interface StatusBannerProps {
  tenant: TenantConfig;
  status: TenantStatus;
  onStatusChange: (status: TenantStatus) => void;
  onNavigateToTab: (tab: string) => void;
}

export const StatusBanner: React.FC<StatusBannerProps> = ({
  tenant,
  status,
  onStatusChange,
  onNavigateToTab,
}) => {
  if (status === 'setup_incomplete') {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-amber-300 bg-[#FFF8EC] px-[22px] py-5">
        <AlertTriangle className="h-5 w-5 flex-none text-[#C2860C]" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold text-[#6B4A06]">
            Your receptionist is not answering yet
          </div>
          <p className="m-0 mt-1 text-[13px] leading-[1.5] text-[#8A6520]">
            {tenant.businessName} is set up, but calls to{' '}
            {tenant.phoneNumber || 'your number'} are not forwarding to your
            assistant line yet.
          </p>
        </div>
        <PrimaryButton type="button" onClick={() => onNavigateToTab('phone')}>
          Finish forwarding
        </PrimaryButton>
      </div>
    );
  }

  if (status === 'paused') {
    return (
      <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#E4E8F0] bg-white px-[22px] py-5">
        <Pause className="h-5 w-5 flex-none text-[#6B7488]" />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold">
            Your receptionist is paused
          </div>
          <p className="m-0 mt-1 text-[13px] text-[#6B7488]">
            Calls go to voicemail until you turn it back on.
          </p>
        </div>
        <PrimaryButton type="button" onClick={() => onStatusChange('active')}>
          <Play className="h-4 w-4" />
          Resume answering
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[18px] border border-[#E4E8F0] bg-white px-[22px] py-4">
      <CheckCircle2 className="h-5 w-5 flex-none text-[#0E8A5F]" />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold">
          Answering every call to {tenant.phoneNumber || 'your line'}
        </div>
        <p className="m-0 mt-0.5 text-[12.5px] text-[#6B7488]">
          {tenant.businessHours || 'Around the clock'}. Transfers to a person
          are set up under Settings.
        </p>
      </div>
      <SecondaryButton type="button" onClick={() => onStatusChange('paused')}>
        <Pause className="h-3.5 w-3.5" />
        Pause
      </SecondaryButton>
    </div>
  );
};

/**
 * The billing nudge under the status banner: no plan yet, or minutes
 * running low. Nothing here mentions what calls cost Ringgy — only the
 * customer's own allowance and rate.
 */
export const BillingBanner: React.FC<{
  billing: ApiBilling | null;
  onNavigateToTab: (tab: string) => void;
}> = ({ billing, onNavigateToTab }) => {
  if (!billing) return null;

  // Choosing a plan needs Stripe, so a server without billing never asks.
  if (!hasLivePlan(billing)) {
    if (!billing.billingEnabled) return null;
    return (
      <Notice
        tone="blue"
        title="Choose a plan to go live"
        action={
          <PrimaryButton type="button" onClick={() => onNavigateToTab('billing')}>
            Choose a plan
          </PrimaryButton>
        }
      >
        Your receptionist is set up. Pick a plan, then get a phone number or
        connect your own phone system.
      </Notice>
    );
  }

  const usage = billing.usage;
  if (!usage || usage.state === 'ok') return null;

  const link = (
    <SecondaryButton type="button" onClick={() => onNavigateToTab('billing')}>
      View usage
    </SecondaryButton>
  );

  return usage.state === 'approaching' ? (
    <Notice tone="amber" title="You're approaching your monthly limit." action={link}>
      {Math.round(usage.includedUsedMinutes).toLocaleString()} of{' '}
      {usage.includedMinutes.toLocaleString()} included minutes used.
    </Notice>
  ) : (
    <Notice tone="amber" title="You've used all your included minutes" action={link}>
      {usage.overageEnabled
        ? `Extra minutes are now billed at ${formatPerMinute(usage.overageCentsPerMin)}. `
        : ''}
      Calls keep being answered.
    </Notice>
  );
};
