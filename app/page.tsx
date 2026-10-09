'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Appointment, Call, TenantStatus } from '@/types/schema';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDashboard } from '@/lib/useDashboard';

import { DashboardShell } from '@/components/dashboard/DashboardShell';
import {
  BillingBanner,
  StatusBanner,
} from '@/components/dashboard/StatusBanner';
import { Notice } from '@/components/dashboard/ui';
import {
  LockedScreen,
  ServiceAccessBanner,
} from '@/components/dashboard/TrialBanner';
import { PAGES } from '@/components/dashboard/DashboardShell';
import { errorMessage, formatE164 } from '@/lib/billing';
import type { ApiPhoneSetup } from '@/lib/api-types';
import { OverviewView } from '@/components/dashboard/OverviewView';
import { CallsView } from '@/components/dashboard/CallsView';
import { AppointmentsView } from '@/components/dashboard/AppointmentsView';
import { CompanyProfileView } from '@/components/dashboard/CompanyProfileView';
import { PhoneView } from '@/components/dashboard/PhoneView';
import { BillingView } from '@/components/dashboard/BillingView';
import { AccountView } from '@/components/dashboard/AccountView';
import { HandoverCard } from '@/components/dashboard/HandoverCard';
import { SettingsView } from '@/components/dashboard/SettingsView';
import { AppointmentModal } from '@/components/appointments/AppointmentModal';
import { TestCallModal } from '@/components/assistant/TestCallModal';

/**
 * What the dashboard was opened with. Stripe sends the browser back here
 * with `?billing=success&session_id=…` (a plan) or `?addon=success&…` (a
 * one-time add-on); signup adds `setup=number` so the owner lands on the
 * phone tab to pick a number next, and `trial=started` when the account was
 * created on the free trial (no checkout). `?tab=` opens any page directly.
 *
 * Read from `window.location` rather than `useSearchParams`: the page only
 * renders past the session spinner in the browser, and this avoids a
 * Suspense boundary around the whole dashboard just to read a query once.
 */
interface EntryParams {
  tab: string | null;
  billing: string | null;
  addon: string | null;
  sessionId: string | null;
  setupNumber: boolean;
  trialStarted: boolean;
}

function readEntryParams(): EntryParams | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return {
    tab: params.get('tab'),
    billing: params.get('billing'),
    addon: params.get('addon'),
    sessionId: params.get('session_id'),
    setupNumber: params.get('setup') === 'number',
    trialStarted: params.get('trial') === 'started',
  };
}

function initialTab(entry: EntryParams | null): string {
  if (!entry) return 'overview';
  if (entry.setupNumber) return 'phone';
  if (entry.tab && PAGES.some((page) => page.id === entry.tab)) return entry.tab;
  if (entry.billing || entry.addon) return 'billing';
  return 'overview';
}

interface PageNotice {
  tone: 'green' | 'amber' | 'blue';
  title: string;
  body?: string;
}

function initialNotice(entry: EntryParams | null): PageNotice | null {
  if (entry?.billing === 'cancelled' || entry?.addon === 'cancelled') {
    return { tone: 'blue', title: 'Checkout cancelled', body: 'Nothing was charged.' };
  }
  if (entry?.billing === 'unavailable') {
    return {
      tone: 'blue',
      title: "Billing isn't set up on this server yet",
      body: 'Your account is ready. You can choose a plan from Billing and usage once billing is available.',
    };
  }
  return null;
}

/** First landing after signing up on the free trial. */
function trialStartedNotice(setup: ApiPhoneSetup | null): PageNotice {
  const number = setup?.phoneNumber ? formatE164(setup.phoneNumber) : null;
  if (setup?.status === 'FAILED') {
    return {
      tone: 'amber',
      title: 'Your free trial has started, but we could not finish your phone setup',
      body: `${setup.error ?? 'Something went wrong.'} Pick another number or connect SIP below.`,
    };
  }
  if (setup?.status === 'DONE' && setup.method === 'FORWARD') {
    return {
      tone: 'green',
      title: `Your free trial has started and ${number ?? 'your number'} is ready`,
      body: 'Last step: dial your carrier’s forwarding code below so unanswered calls reach your receptionist. No card needed.',
    };
  }
  if (setup?.status === 'DONE' && setup.method === 'SIP') {
    return {
      tone: 'green',
      title: 'Your free trial has started and SIP is ready',
      body: 'Point your phone system at the SIP address below. No card needed.',
    };
  }
  if (setup?.status === 'DONE') {
    return {
      tone: 'green',
      title: `Your free trial has started — ${number ?? 'your number'} is live`,
      body: 'Calls to it are answered by your receptionist from now on. No card needed; upgrade whenever you like.',
    };
  }
  return {
    tone: 'green',
    title: 'Your free trial has started',
    body: 'No card needed. Get a phone number or connect your phone system below to start taking calls.',
  };
}

/** What to tell the owner after the signup phone choice was carried out. */
function phoneSetupNotice(setup: ApiPhoneSetup | null): PageNotice {
  const number = setup?.phoneNumber ? formatE164(setup.phoneNumber) : 'Your number';
  if (setup?.status === 'DONE') {
    if (setup.method === 'SIP') {
      return {
        tone: 'green',
        title: 'Your plan is active and SIP is ready',
        body: 'Point your phone system at the SIP address below to start sending calls to your receptionist.',
      };
    }
    if (setup.method === 'FORWARD') {
      return {
        tone: 'green',
        title: `Your plan is active and ${number} is ready`,
        body: 'Last step: dial your carrier’s forwarding code below so unanswered calls reach your receptionist.',
      };
    }
    return {
      tone: 'green',
      title: `Your plan is active — ${number} is yours`,
      body: 'Calls to it are answered by your receptionist from now on.',
    };
  }
  if (setup?.status === 'FAILED') {
    return {
      tone: 'amber',
      title: 'Your plan is active, but we could not finish your phone setup',
      body: `${setup.error ?? 'Something went wrong.'} Pick another number or connect SIP below.`,
    };
  }
  return {
    tone: 'green',
    title: 'Your plan is active',
    body: 'One last step: get a phone number or connect your phone system below.',
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading, logout } = useAuth();

  const {
    tenant,
    calls,
    appointments,
    overview,
    isLoading,
    error,
    saveTenant,
    resyncAssistant,
    setPaused,
    saveAppointment,
    cancelAppointment,
    resolveCall,
    verifyForwarding,
    billing,
    plans,
    invoices,
    addOns,
    phoneNumbers,
    sip,
    phoneSetup,
    confirmCheckout,
    completePhoneSetup,
    changePlan,
    cancelSubscription,
    resumeSubscription,
    purchaseAddOn,
    cancelAddOn,
    buyNumber,
    releaseNumber,
    connectSip,
    disconnectSip,
    access,
  } = useDashboard(Boolean(session));

  // Unauthenticated visitors belong on the sign-in screen.
  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace('/login');
    }
  }, [isSessionLoading, session, router]);

  const [entry] = useState(readEntryParams);
  const [activeTab, setActiveTab] = useState(() => initialTab(entry));
  const [notice, setNotice] = useState<PageNotice | null>(() =>
    initialNotice(entry),
  );
  const [showSetupPrompt, setShowSetupPrompt] = useState(
    () => entry?.setupNumber ?? false,
  );
  const handledEntryRef = useRef(false);

  // Back from Stripe: confirm the session so the plan or minute pack shows
  // straight away instead of waiting on the webhook, then drop the query so
  // a refresh does not confirm it again. Once only — StrictMode runs effects
  // twice in development.
  useEffect(() => {
    if (!session || handledEntryRef.current || !entry) return;
    handledEntryRef.current = true;

    if (window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Signed up on the free trial: there is no checkout to confirm, so the
    // phone choice from signup is carried out straight away.
    if (entry.trialStarted) {
      void completePhoneSetup()
        .catch(() => null)
        .then((setup) => setNotice(trialStartedNotice(setup)));
      return;
    }

    const succeeded = entry.billing === 'success' || entry.addon === 'success';
    if (!succeeded || !entry.sessionId) return;

    const isAddOn = entry.addon === 'success';
    confirmCheckout(entry.sessionId)
      .then(async (result) => {
        if (result.status !== 'complete') {
          setNotice({
            tone: 'amber',
            title: 'Payment still processing',
            body: 'It can take a minute to appear here. Refresh shortly.',
          });
          return;
        }
        if (isAddOn || !entry.setupNumber) {
          setNotice({
            tone: 'green',
            title: isAddOn ? 'Add-on purchased' : 'Your plan is active',
            body: isAddOn
              ? 'Thanks! It is on your account now.'
              : 'Thanks! Your receipt is on its way by email.',
          });
          return;
        }
        // Straight from signup: carry out the phone choice made there.
        const setup = await completePhoneSetup().catch(() => null);
        setNotice(phoneSetupNotice(setup));
      })
      .catch((caught: unknown) => {
        setNotice({
          tone: 'amber',
          title: 'We could not confirm your payment yet',
          body: `${errorMessage(caught)} It can take a minute to appear — refresh shortly.`,
        });
      });
  }, [session, entry, confirmCheckout, completePhoneSetup]);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<
    Partial<Appointment>
  >({});
  const [isTestCallOpen, setIsTestCallOpen] = useState(false);

  // Server-computed when available, otherwise derived from the calls already
  // loaded.
  const needsReviewCount =
    overview?.needsReviewCount ??
    calls.filter((call) => call.outcome === 'needs_review' && !call.isResolved)
      .length;

  const status: TenantStatus = tenant?.status ?? 'setup_incomplete';

  // The free trial (or a plan) decides what the dashboard may do. Without
  // the access read — an older server — nothing is restricted.
  const readOnly = access?.readOnly ?? false;
  const locked = access?.locked ?? false;
  const answeringStopped = access ? !access.canAnswerCalls : false;
  const onTrial = Boolean(access?.trial && access.trial.status !== 'CONVERTED');

  const openAppointmentFromCall = (call: Call) => {
    const captured = call.extractedAppointment;

    setEditingAppointment({
      customerName: captured?.customerName || call.callerName,
      customerPhone: captured?.customerPhone || call.callerPhone,
      service: captured?.service || 'General service',
      dateTime: captured?.requestedTimeIso ?? '',
      address: captured?.address ?? '',
      notes: captured?.notes ?? '',
      priceEstimate: captured?.priceEstimate,
      status: 'confirmed',
      isAiCreated: true,
      callId: call.callControlId,
    });
    setIsAppointmentModalOpen(true);
  };

  const openAppointment = (data?: Partial<Appointment>) => {
    // An existing appointment displays its time as friendly text; the form
    // needs the absolute value to prefill its datetime input.
    setEditingAppointment(
      data ? { ...data, dateTime: data.scheduledAtIso ?? data.dateTime ?? '' } : {},
    );
    setIsAppointmentModalOpen(true);
  };

  if (isSessionLoading || (session && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F2F4F8]">
        <div className="flex items-center gap-3 text-sm font-semibold text-[#6B7488]">
          <Loader2 className="h-5 w-5 animate-spin text-[#2F6BFF]" />
          <span>Loading your dashboard…</span>
        </div>
      </div>
    );
  }

  // The redirect above is in flight.
  if (!session || !tenant) return null;

  return (
    <DashboardShell
      tenant={tenant}
      status={status}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      needsReviewCount={needsReviewCount}
      onStartTestCall={
        answeringStopped ? undefined : () => setIsTestCallOpen(true)
      }
      answeringStopped={answeringStopped}
      onLogout={() => {
        // The cookie is cleared server-side; the redirect is what stops the
        // dashboard refetching with a session that no longer exists.
        void logout().then(() => router.replace('/login'));
      }}
      error={error}
    >
      {notice && (
        <Notice
          tone={notice.tone}
          title={notice.title}
          onDismiss={() => setNotice(null)}
        >
          {notice.body}
        </Notice>
      )}

      <ServiceAccessBanner
        access={access}
        onUpgrade={() => setActiveTab('billing')}
      />

      {locked && access && activeTab !== 'billing' ? (
        <LockedScreen access={access} onUpgrade={() => setActiveTab('billing')} />
      ) : (
        <>
          {activeTab === 'overview' && (
            <>
              {!answeringStopped && (
                <StatusBanner
                  tenant={tenant}
                  status={status}
                  onStatusChange={(next) => void setPaused(next === 'paused')}
                  onNavigateToTab={setActiveTab}
                />
              )}
              {!onTrial && !readOnly && (
                <BillingBanner billing={billing} onNavigateToTab={setActiveTab} />
              )}
              <OverviewView
                overview={overview}
                calls={calls}
                appointments={appointments}
                needsReviewCount={needsReviewCount}
                onSelectTab={setActiveTab}
                onSelectCall={(call) => {
                  setSelectedCall(call);
                  setActiveTab('calls');
                }}
              />
            </>
          )}

          {activeTab === 'calls' && (
            <CallsView
              calls={calls}
              selectedCall={selectedCall}
              readOnly={readOnly}
              onSelectCall={setSelectedCall}
              onCreateAppointmentFromCall={openAppointmentFromCall}
              onMarkResolved={(callId) => {
                void resolveCall(callId);
                setSelectedCall((current) =>
                  current && current.id === callId
                    ? { ...current, isResolved: true }
                    : current,
                );
              }}
            />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView
              appointments={appointments}
              readOnly={readOnly}
              onOpenModal={openAppointment}
              onCancelAppointment={(id) => void cancelAppointment(id)}
            />
          )}

          {/* A disabled fieldset turns every control in these forms off at
              once while leaving the content readable. */}
          {activeTab === 'assistant' && (
            <fieldset disabled={readOnly} className="contents">
              <CompanyProfileView
                tenant={tenant}
                onSaveTenant={(updated) => void saveTenant(updated)}
                onResyncAssistant={() => void resyncAssistant()}
              />
            </fieldset>
          )}

          {activeTab === 'phone' && (
            <fieldset disabled={readOnly} className="contents">
            <PhoneView
              tenant={tenant}
              billing={billing}
              access={access}
              phoneNumbers={phoneNumbers}
              sip={sip}
              phoneSetup={phoneSetup}
              showSetupPrompt={showSetupPrompt}
              onDismissSetupPrompt={() => setShowSetupPrompt(false)}
              onVerifyForwarding={() => void verifyForwarding()}
              onBuyNumber={buyNumber}
              onReleaseNumber={releaseNumber}
              onConnectSip={connectSip}
              onDisconnectSip={disconnectSip}
              onSelectTab={setActiveTab}
            />
            </fieldset>
          )}

          {activeTab === 'billing' && (
            <BillingView
              billing={billing}
              access={access}
              plans={plans}
              invoices={invoices}
              addOns={addOns}
              onChangePlan={changePlan}
              onCancel={cancelSubscription}
              onResume={resumeSubscription}
              onPurchaseAddOn={purchaseAddOn}
              onCancelAddOn={cancelAddOn}
            />
          )}

          {activeTab === 'settings' && (
            <fieldset disabled={readOnly} className="flex flex-col gap-[18px]">
              <HandoverCard />
              <SettingsView />
            </fieldset>
          )}

          {activeTab === 'account' && (
            <fieldset disabled={readOnly} className="contents">
              <AccountView
                tenant={tenant}
                onUpdateTenant={(updated) => void saveTenant(updated)}
              />
            </fieldset>
          )}
        </>
      )}

      <AppointmentModal
        isOpen={isAppointmentModalOpen}
        onClose={() => setIsAppointmentModalOpen(false)}
        onSave={(data) => void saveAppointment(data)}
        initialData={editingAppointment}
        readOnly={readOnly}
      />

      {/* Real WebRTC conversation with this tenant's own assistant.
          Unmounted when closed, which is what hangs up the call. */}
      {isTestCallOpen && (
        <TestCallModal
          tenant={tenant}
          onClose={() => setIsTestCallOpen(false)}
          onGoToSetup={() => {
            setIsTestCallOpen(false);
            setActiveTab('phone');
          }}
        />
      )}
    </DashboardShell>
  );
}
