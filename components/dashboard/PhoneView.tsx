'use client';

/**
 * The Ringgy numbers this tenant owns, the SIP alternative for customers who
 * keep their own phone system, and call forwarding from the business number
 * to the primary Ringgy number.
 *
 * Numbers and SIP both need a live plan, so without one the page leads with
 * a prompt to choose a plan instead of letting a purchase fail.
 *
 * The mock puts an on/off switch on call forwarding. Forwarding is
 * configured on the carrier's side with a dial code, so a switch here could
 * only ever lie about the state of something it cannot change — this shows
 * the verified status and the code to dial instead.
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import type { TenantConfig } from '@/types/schema';
import type {
  ApiAvailableNumber,
  ApiBilling,
  ApiPhoneNumber,
  ApiPhoneSetup,
  ApiSip,
} from '@/lib/api-types';
import { api } from '@/lib/api';
import { NumberSearch } from '@/components/phone/NumberSearch';
import { CARRIERS } from '@/lib/mockData';
import { toE164 } from '@/lib/mappers';
import {
  errorMessage,
  formatCents,
  formatE164,
  hasLivePlan,
} from '@/lib/billing';
import {
  Card,
  CardTitle,
  ConfirmDialog,
  FIELD,
  LABEL,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Tag,
} from './ui';

interface PhoneViewProps {
  tenant: TenantConfig;
  billing: ApiBilling | null;
  phoneNumbers: ApiPhoneNumber[];
  sip: ApiSip | null;
  /** The phone choice made at signup and whether it was carried out. */
  phoneSetup?: ApiPhoneSetup | null;
  /** Set on the way back from signup checkout: the next step is a number or SIP. */
  showSetupPrompt?: boolean;
  onDismissSetupPrompt?: () => void;
  onVerifyForwarding: () => void;
  onBuyNumber: (phoneNumber: string, country?: string) => Promise<void>;
  onReleaseNumber: (id: string) => Promise<void>;
  onConnectSip: (customerNumberE164?: string) => Promise<void>;
  onDisconnectSip: () => Promise<void>;
  onSelectTab: (tab: string) => void;
}

const NUMBER_STATUS_TAGS: Record<
  ApiPhoneNumber['status'],
  { label: string; tone: 'green' | 'blue' | 'grey' | 'amber' | 'red' }
> = {
  ACTIVE: { label: 'Active', tone: 'green' },
  PENDING: { label: 'Setting up', tone: 'amber' },
  FAILED: { label: 'Failed', tone: 'red' },
  RELEASED: { label: 'Released', tone: 'grey' },
};

const SIP_STATUS_TAGS: Record<
  ApiSip['status'],
  { label: string; tone: 'green' | 'blue' | 'grey' | 'amber' | 'red' }
> = {
  ACTIVE: { label: 'Connected', tone: 'green' },
  PENDING: { label: 'Setting up', tone: 'amber' },
  FAILED: { label: 'Failed', tone: 'red' },
  DISABLED: { label: 'Disabled', tone: 'grey' },
};

const HANDLING = [
  {
    title: 'Customers keep calling your number',
    body: 'Nothing about the number on your truck or your website changes.',
  },
  {
    title: 'Unanswered calls forward to your receptionist',
    body: 'The dial code below tells your carrier to send calls you do not pick up to your assistant line.',
  },
  {
    title: 'The assistant answers around the clock',
    body: 'Outside your business hours it answers on the first ring, books what it can and takes a message for the rest.',
  },
];

export const PhoneView: React.FC<PhoneViewProps> = ({
  tenant,
  billing,
  phoneNumbers,
  sip,
  phoneSetup,
  showSetupPrompt,
  onDismissSetupPrompt,
  onVerifyForwarding,
  onBuyNumber,
  onReleaseNumber,
  onConnectSip,
  onDisconnectSip,
  onSelectTab,
}) => {
  const live = hasLivePlan(billing);
  const connected =
    phoneNumbers.some((number) => number.status !== 'RELEASED') ||
    sip?.status === 'ACTIVE';
  // The signup choice could not be carried out (typically: the picked
  // number was taken before the plan was paid). Shown until the owner has
  // another way in.
  const setupFailed = phoneSetup?.status === 'FAILED' && !connected;

  return (
    <>
      {setupFailed && (
        <Notice tone="amber" title="We couldn't finish the phone setup you chose at signup">
          {phoneSetup?.error ?? 'Something went wrong.'}{' '}
          {phoneSetup?.method === 'SIP'
            ? 'Try connecting your phone system again below.'
            : 'Pick another number below — it is included in your plan.'}
        </Notice>
      )}

      {showSetupPrompt && phoneSetup?.status !== 'DONE' && !setupFailed && (
        <Notice
          tone="blue"
          title="Last step: connect your calls"
          onDismiss={onDismissSetupPrompt}
        >
          {live
            ? 'Your plan is active. Get a Ringgy number below (then forward your business line to it), or connect your existing phone system over SIP.'
            : 'As soon as your plan is confirmed you can get a Ringgy number or connect your existing phone system here.'}
        </Notice>
      )}

      {!live && (
        <Notice
          tone="amber"
          title="Choose a plan first"
          action={
            <PrimaryButton type="button" onClick={() => onSelectTab('billing')}>
              See plans
            </PrimaryButton>
          }
        >
          Phone numbers and SIP connections are part of your plan. Pick one to
          get a number or connect your own phone system.
        </Notice>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-2">
        <NumbersCard
          billing={billing}
          live={live}
          phoneNumbers={phoneNumbers}
          onBuyNumber={onBuyNumber}
          onReleaseNumber={onReleaseNumber}
        />
        <SipCard
          sip={sip}
          live={live}
          defaultNumber={toE164(tenant.phoneNumber) ?? ''}
          onConnectSip={onConnectSip}
          onDisconnectSip={onDisconnectSip}
        />
      </div>

      <ForwardingPanel tenant={tenant} onVerifyForwarding={onVerifyForwarding} />
    </>
  );
};

/* ------------------------------------------------------------------ *
 * Ringgy numbers: the list, and search + buy
 * ------------------------------------------------------------------ */

const NumbersCard: React.FC<{
  billing: ApiBilling | null;
  live: boolean;
  phoneNumbers: ApiPhoneNumber[];
  onBuyNumber: (phoneNumber: string, country?: string) => Promise<void>;
  onReleaseNumber: (id: string) => Promise<void>;
}> = ({ billing, live, phoneNumbers, onBuyNumber, onReleaseNumber }) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [buying, setBuying] = useState<{ result: ApiAvailableNumber; country: string } | null>(null);
  const [releasing, setReleasing] = useState<ApiPhoneNumber | null>(null);
  // Remounts the search (clearing its results) after a purchase.
  const [searchKey, setSearchKey] = useState(0);

  const numbers = phoneNumbers.filter((number) => number.status !== 'RELEASED');
  const includedCount = billing?.subscription?.plan.includedPhoneNumbers ?? 0;
  const nextIsIncluded = (billing?.phoneNumbers.count ?? numbers.length) < includedCount;

  return (
    <Card className="p-[22px]">
      <CardTitle
        title="Your Ringgy numbers"
        action={
          <SecondaryButton
            type="button"
            disabled={!live}
            title={live ? undefined : 'Choose a plan first'}
            onClick={() => setIsSearchOpen((open) => !open)}
          >
            {isSearchOpen ? 'Close search' : 'Get a new number'}
          </SecondaryButton>
        }
        className="mb-4 items-center"
      />

      {numbers.length === 0 ? (
        <p className="m-0 text-[13px] leading-[1.5] text-[#6B7488]">
          No numbers yet. Your receptionist answers calls to a Ringgy number —
          get one here, or connect your own phone system over SIP.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {numbers.map((number) => {
            const tag = NUMBER_STATUS_TAGS[number.status];
            return (
              <div
                key={number.id}
                className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#E4E8F0] px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold">
                    {formatE164(number.phoneNumber)}
                    {number.isPrimary && <Tag tone="blue">Primary</Tag>}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[#6B7488]">
                    {[
                      [number.locality, number.region].filter(Boolean).join(', '),
                      number.billing === 'INCLUDED'
                        ? 'Included in your plan'
                        : number.monthlyPriceCents !== null
                          ? `${formatCents(number.monthlyPriceCents)}/mo`
                          : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {number.statusDetail && number.status !== 'ACTIVE' && (
                    <div className="mt-0.5 text-[12px] text-[#A2600B]">
                      {number.statusDetail}
                    </div>
                  )}
                </div>
                <Tag tone={tag.tone}>{tag.label}</Tag>
                <button
                  type="button"
                  onClick={() => setReleasing(number)}
                  className="text-[12.5px] font-bold text-[#B4322C] hover:underline"
                >
                  Release
                </button>
              </div>
            );
          })}
        </div>
      )}

      {isSearchOpen && (
        <div className="mt-5 border-t border-[#E4E8F0] pt-5">
          <NumberSearch
            key={searchKey}
            search={api.searchNumbers}
            actionLabel="Buy"
            priceLabel={(result) =>
              nextIsIncluded
                ? 'Included in your plan'
                : result.monthlyPriceCents !== null
                  ? `${formatCents(result.monthlyPriceCents)}/mo`
                  : null
            }
            blockedReason={(result) =>
              result.masked
                ? 'Number purchasing is pending carrier account verification'
                : live
                  ? null
                  : 'Choose a plan first'
            }
            onPick={(result, country) => setBuying({ result, country })}
          />
        </div>
      )}

      {buying && (
        <ConfirmDialog
          title={`Get ${formatE164(buying.result.phoneNumber)}?`}
          confirmLabel="Get this number"
          onClose={() => setBuying(null)}
          onConfirm={async () => {
            await onBuyNumber(buying.result.phoneNumber, buying.country);
            setSearchKey((key) => key + 1);
            setIsSearchOpen(false);
          }}
        >
          {nextIsIncluded
            ? 'This number is included in your plan — no extra charge.'
            : `This number is billed at ${formatCents(
                buying.result.monthlyPriceCents ?? billing?.phoneNumbers.monthlyPriceCents ?? 0,
              )}/mo on top of your plan, until you release it.`}
        </ConfirmDialog>
      )}

      {releasing && (
        <ConfirmDialog
          title={`Release ${formatE164(releasing.phoneNumber)}?`}
          confirmLabel="Release number"
          danger
          onClose={() => setReleasing(null)}
          onConfirm={() => onReleaseNumber(releasing.id)}
        >
          Calls to this number stop reaching your receptionist straight away
          and billing for it stops. Released numbers usually can&apos;t be
          got back.
          {releasing.isPrimary &&
            ' It is your primary number, so anything forwarding to it will stop working too.'}
        </ConfirmDialog>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * SIP: keep your own phone system and route calls to the receptionist
 * ------------------------------------------------------------------ */

const SipCard: React.FC<{
  sip: ApiSip | null;
  live: boolean;
  defaultNumber: string;
  onConnectSip: (customerNumberE164?: string) => Promise<void>;
  onDisconnectSip: () => Promise<void>;
}> = ({ sip, live, defaultNumber, onConnectSip, onDisconnectSip }) => {
  const [number, setNumber] = useState(defaultNumber);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const connected = sip && sip.status !== 'DISABLED' ? sip : null;

  const copy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 2000);
  };

  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await onConnectSip(number.trim() ? toE164(number) : undefined);
    } catch (caught) {
      setError(errorMessage(caught));
    }
    setIsConnecting(false);
  };

  const row = (key: string, label: string, value: string) => (
    <div key={key} className="flex items-center gap-3 rounded-[10px] border border-[#E4E8F0] bg-[#FCFCFD] px-3.5 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-semibold text-[#8A93A6]">{label}</div>
        <div className="truncate font-mono text-[13px] font-bold">{value}</div>
      </div>
      <button
        type="button"
        onClick={() => copy(key, value)}
        className="flex flex-none items-center gap-1.5 rounded-lg bg-[#EEF3FF] px-2.5 py-1.5 text-xs font-bold text-[#2F6BFF] transition hover:bg-[#E2EAFF]"
      >
        <Copy className="h-3.5 w-3.5" />
        {copied === key ? 'Copied' : 'Copy'}
      </button>
    </div>
  );

  return (
    <Card className="p-[22px]">
      <CardTitle
        title="Use my existing phone system (SIP)"
        action={
          connected ? (
            <Tag tone={SIP_STATUS_TAGS[connected.status].tone}>
              {SIP_STATUS_TAGS[connected.status].label}
            </Tag>
          ) : undefined
        }
        className="mb-2 items-center"
      />

      {connected ? (
        <>
          <p className="m-0 mb-3.5 text-[13px] leading-[1.5] text-[#6B7488]">
            Point your phone system (PBX) at this address and route the calls
            you want answered to it.
            {connected.customerNumberE164 &&
              ` Calls for ${formatE164(connected.customerNumberE164)}.`}
          </p>
          {connected.statusDetail && connected.status !== 'ACTIVE' && (
            <Notice tone="amber" className="mb-3">
              {connected.statusDetail}
            </Notice>
          )}
          <div className="flex flex-col gap-2">
            {row('uri', 'SIP URI', connected.sipUri)}
            {row('host', 'Host', connected.host)}
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 text-[12.5px]">
            <div>
              <div className="font-semibold text-[#8A93A6]">Transports</div>
              <div className="mt-0.5 font-bold">{connected.transports.join(', ') || '—'}</div>
            </div>
            <div>
              <div className="font-semibold text-[#8A93A6]">Codecs</div>
              <div className="mt-0.5 font-bold">{connected.codecs.join(', ') || '—'}</div>
            </div>
          </div>
          {connected.notes.length > 0 && (
            <ul className="m-0 mt-3 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-[1.5] text-[#5C6579]">
              {connected.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          <SecondaryButton
            type="button"
            className="mt-4"
            onClick={() => setIsDisconnecting(true)}
          >
            Disconnect SIP
          </SecondaryButton>
        </>
      ) : (
        <>
          <p className="m-0 mb-3.5 text-[13px] leading-[1.5] text-[#6B7488]">
            Already have a business phone system? Keep it and send calls to
            your receptionist over SIP — no new number needed.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Your existing number (optional)</span>
            <input
              type="tel"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="+1 555 234 8900"
              className={FIELD}
            />
          </label>
          {error && (
            <Notice tone="amber" className="mt-3">
              {error}
            </Notice>
          )}
          <PrimaryButton
            type="button"
            className="mt-3.5"
            disabled={!live || isConnecting}
            title={live ? undefined : 'Choose a plan first'}
            onClick={() => void connect()}
          >
            {isConnecting && <Loader2 className="h-4 w-4 animate-spin" />}
            Connect my phone system
          </PrimaryButton>
        </>
      )}

      {isDisconnecting && (
        <ConfirmDialog
          title="Disconnect SIP?"
          confirmLabel="Disconnect"
          danger
          onClose={() => setIsDisconnecting(false)}
          onConfirm={onDisconnectSip}
        >
          Calls your phone system sends to this address will stop reaching
          your receptionist.
        </ConfirmDialog>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * Call forwarding from the business number to the primary Ringgy number
 * ------------------------------------------------------------------ */

const ForwardingPanel: React.FC<{
  tenant: TenantConfig;
  onVerifyForwarding: () => void;
}> = ({ tenant, onVerifyForwarding }) => {
  const [carrierId, setCarrierId] = useState(CARRIERS[0].id);
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const carrier = CARRIERS.find((entry) => entry.id === carrierId) ?? CARRIERS[0];
  const aiDigits = tenant.aiPhoneNumber.replace(/\D/g, '');
  const dialCode = `${carrier.forwardingCode}${aiDigits}`;

  const fillStep = (step: string) =>
    step
      .replace(/\{aiNumberDigits\}/g, aiDigits)
      .replace(/\{aiNumber\}/g, tenant.aiPhoneNumber);

  const copy = () => {
    navigator.clipboard?.writeText(dialCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const verify = () => {
    setIsVerifying(true);
    onVerifyForwarding();
    // The check is a round trip to the backend; the spinner is released on
    // the refetched profile arriving, which flips `isForwardingVerified`.
    setTimeout(() => setIsVerifying(false), 2000);
  };

  return (
    <div className="grid items-start gap-[18px] xl:grid-cols-2">
      <Card className="p-[22px]">
        <div className="text-xs font-bold tracking-[.08em] text-[#8A93A6] uppercase">
          Your business number
        </div>
        <div className="my-2.5 text-[30px] font-extrabold tracking-[-0.02em]">
          {tenant.phoneNumber || 'Not set'}
        </div>
        <div className="text-[13px] text-[#6B7488]">
          Customers keep calling this number. Nothing changed.
        </div>

        <div className="my-5 h-px bg-[#E4E8F0]" />

        <div className="text-xs font-bold tracking-[.08em] text-[#8A93A6] uppercase">
          Forwards to
        </div>
        <div className="mt-2 mb-0.5 text-[20px] font-extrabold">
          {tenant.aiPhoneNumber || 'No Ringgy number yet'}
        </div>
        <div className="mb-3.5 text-[12.5px] font-semibold text-[#6B7488]">
          AI receptionist
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3.5 rounded-[12px] border border-[#E4E8F0] bg-[#F8FAFF] px-4 py-3.5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13.5px] font-bold">
              {tenant.isForwardingVerified ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-[#0E8A5F]" />
                  Call forwarding is live
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-[#C2860C]" />
                  Forwarding not confirmed yet
                </>
              )}
            </div>
            <div className="mt-0.5 text-[12.5px] text-[#6B7488]">
              {tenant.isForwardingVerified
                ? 'Unanswered calls reach your AI receptionist.'
                : 'Dial the code on the right, then check it here.'}
            </div>
          </div>
          <PrimaryButton onClick={verify} disabled={isVerifying} type="button">
            {isVerifying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Check forwarding
          </PrimaryButton>
        </div>

        <div className="mt-[18px] flex flex-col gap-3">
          {HANDLING.map((rule, index) => (
            <div
              key={rule.title}
              className="flex items-start gap-3 rounded-[12px] border border-[#E4E8F0] px-[15px] py-3.5"
            >
              <div className="mt-px grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-[#EEF3FF] text-[11px] font-bold text-[#2F6BFF]">
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold">{rule.title}</div>
                <div className="mt-[3px] text-[12.5px] leading-[1.5] text-[#6B7488]">
                  {rule.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-[22px]">
        <CardTitle
          title="Set up forwarding at your carrier"
          hint="Takes about a minute"
          className="mb-4"
        />

        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {CARRIERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCarrierId(entry.id)}
              className={`rounded-[10px] border px-3 py-2.5 text-center text-[12.5px] font-bold transition ${
                entry.id === carrierId
                  ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                  : 'border-[#DDE1EA] bg-white text-[#26304A] hover:border-[#B9C3D8]'
              }`}
            >
              {entry.name}
            </button>
          ))}
        </div>

        <div className="rounded-[14px] bg-[#0E1526] px-[18px] py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-[.08em] text-[#8A94AC] uppercase">
              {carrier.name} forwarding code
            </span>
            <span className="text-[11px] text-[#3DD598]">
              Conditional forwarding
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[10px] bg-black/30 px-3.5 py-3">
            <span className="font-mono text-lg font-bold text-[#F6CE8E]">
              {aiDigits ? dialCode : 'Get a Ringgy number first'}
            </span>
            {aiDigits !== '' && (
              <button
                type="button"
                onClick={copy}
                className="flex flex-none items-center gap-1.5 rounded-lg bg-[#2F6BFF] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1E4FD8]"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          <p className="m-0 mt-3 text-xs leading-[1.5] text-[#8A94AC]">
            Dialling this sets conditional forwarding: when you are on a job
            or do not pick up, the receptionist answers instead of voicemail.
          </p>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          {carrier.steps.map((step, index) => (
            <div
              key={step}
              className="flex items-start gap-3 rounded-[10px] border border-[#E4E8F0] bg-[#FCFCFD] px-3.5 py-3 text-[12.5px] leading-[1.5] text-[#26304A]"
            >
              <span className="mt-px grid h-5 w-5 flex-none place-items-center rounded-full bg-[#2F6BFF] text-[10px] font-bold text-white">
                {index + 1}
              </span>
              <span>{fillStep(step)}</span>
            </div>
          ))}
        </div>

        {carrier.unforwardCode && (
          <p className="m-0 mt-3 text-xs text-[#8A93A6]">
            To turn forwarding off again, dial {carrier.unforwardCode}.
          </p>
        )}

        <SecondaryButton
          type="button"
          onClick={verify}
          disabled={isVerifying}
          className="mt-4"
        >
          I have dialled it — check now
        </SecondaryButton>
      </Card>
    </div>
  );
};
