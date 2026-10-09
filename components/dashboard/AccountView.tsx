'use client';

/**
 * The owner's own details and alert preferences.
 *
 * The mock's third panel is a team roster with an invite button. There is
 * one user per tenant in the data model and no invite flow, so that panel
 * shows the single real account holder and says what is coming rather than
 * listing invented teammates.
 */

import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { TenantConfig } from '@/types/schema';
import {
  Card,
  CardTitle,
  FIELD,
  LABEL,
  PrimaryButton,
  Toggle,
  initialsOf,
} from './ui';

interface AccountViewProps {
  tenant: TenantConfig;
  onUpdateTenant: (updated: TenantConfig) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  tenant,
  onUpdateTenant,
}) => {
  const [form, setForm] = useState<TenantConfig>(tenant);
  const [justSaved, setJustSaved] = useState(false);

  // A refetched profile replaces the form rather than being silently
  // ignored — a booking taken by phone can change the tenant under us. This
  // is React's render-phase adjustment rather than an effect, so it happens
  // before the stale values are ever painted.
  const [syncedFrom, setSyncedFrom] = useState(tenant);
  if (syncedFrom !== tenant) {
    setSyncedFrom(tenant);
    setForm(tenant);
  }

  const patch = (changes: Partial<TenantConfig>) =>
    setForm((current) => ({ ...current, ...changes }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onUpdateTenant(form);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 3000);
  };

  const notifications = [
    {
      key: 'smsAlertsEnabled' as const,
      label: 'Missed-call alerts',
      hint: 'Text me when the assistant takes a message',
    },
    {
      key: 'emailDigestEnabled' as const,
      label: 'Weekly digest',
      hint: 'Monday summary of every call',
    },
  ];

  return (
    <form onSubmit={submit} className="flex flex-col gap-[18px]">
      {justSaved && (
        <div className="animate-fadeIn flex items-center gap-2 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Account preferences saved.
        </div>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-2">
        <Card className="p-[22px]">
          <CardTitle title="Your details" className="mb-[18px]" />
          <div className="flex flex-col gap-[15px]">
            <label className="flex flex-col gap-[7px]">
              <span className={LABEL}>Full name</span>
              <input
                value={form.ownerName}
                onChange={(event) => patch({ ownerName: event.target.value })}
                className={FIELD}
              />
            </label>

            <label className="flex flex-col gap-[7px]">
              <span className={LABEL}>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => patch({ email: event.target.value })}
                className={FIELD}
              />
            </label>

            <label className="flex flex-col gap-[7px]">
              <span className={LABEL}>Your own line</span>
              <input
                value={form.forwardingNumber}
                onChange={(event) =>
                  patch({ forwardingNumber: event.target.value })
                }
                placeholder="(512) 555-0100"
                className={FIELD}
              />
              <span className="text-xs text-[#8A93A6]">
                Where alerts are texted. Calls are transferred to the handover
                numbers under Settings.
              </span>
            </label>

            <PrimaryButton type="submit" className="self-start">
              Save changes
            </PrimaryButton>
          </div>
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card className="p-[22px]">
            <CardTitle title="Notifications" className="mb-3.5" />
            <div className="flex flex-col gap-3.5">
              {notifications.map((row) => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3.5"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">
                      {row.label}
                    </div>
                    <div className="mt-0.5 text-xs text-[#8A93A6]">
                      {row.hint}
                    </div>
                  </div>
                  <Toggle
                    label={row.label}
                    checked={form[row.key]}
                    onChange={(next) => patch({ [row.key]: next })}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-[22px]">
            <CardTitle title="Team" className="mb-1.5" />
            <div className="mb-3.5 text-[12.5px] text-[#6B7488]">
              People who can see calls and appointments.
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 flex-none place-items-center rounded-full bg-[#EEF3FF] text-xs font-extrabold text-[#2F6BFF]">
                {initialsOf(tenant.ownerName || tenant.businessName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">
                  {tenant.ownerName || 'Account owner'}
                </div>
                <div className="truncate text-xs text-[#8A93A6]">
                  {tenant.email}
                </div>
              </div>
              <div className="flex-none text-xs font-semibold text-[#6B7488]">
                Owner
              </div>
            </div>
            <p className="m-0 mt-4 rounded-[10px] border border-dashed border-[#C6CDDB] px-3.5 py-3 text-[12.5px] text-[#6B7488]">
              Extra logins for dispatchers and office staff are not available
              yet — one account per business for now.
            </p>
          </Card>
        </div>
      </div>
    </form>
  );
};
