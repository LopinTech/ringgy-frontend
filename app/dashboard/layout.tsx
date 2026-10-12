'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { Appointment, Call, TenantStatus } from '@/types/schema';
import { useAuth } from '@/components/auth/AuthProvider';
import { useDashboard } from '@/lib/useDashboard';
import { DashboardShell } from '@/components/dashboard/DashboardShell';
import { PAGES } from '@/components/dashboard/pages';
import { Notice } from '@/components/dashboard/ui';
import {
  LockedScreen,
  ServiceAccessBanner,
} from '@/components/dashboard/TrialBanner';
import { errorMessage, formatE164 } from '@/lib/billing';
import type { ApiPhoneSetup } from '@/lib/api-types';
import { AppointmentModal } from '@/components/appointments/AppointmentModal';
import { TestCallModal } from '@/components/assistant/TestCallModal';
import {
  DashboardDataProvider,
  type DashboardDataValue,
} from '@/components/dashboard/DashboardDataContext';

/**
 * One-shot params left on the URL by the time it reaches a /dashboard/*
 * route: Stripe sends the browser back with `?billing=success&session_id=…`
 * (a plan) or `?addon=success&…` (a one-time add-on, or a hard-coded
 * backend default for cancel paths); signup adds `setup=number`/
 * `trial=started`. `/` (app/page.tsx) already resolves which tab these land
 * on — this layout only needs to act on whatever is left attached.
 *
 * Read from `window.location` rather than `useSearchParams`: this runs once
 * per dashboard visit, and reading it this way avoids wrapping the whole
 * dashboard in a Suspense boundary just for a one-time query read.
 */
interface EntryParams {
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
    billing: params.get('billing'),
    addon: params.get('addon'),
    sessionId: params.get('session_id'),
    setupNumber: params.get('setup') === 'number',
    trialStarted: params.get('trial') === 'started',
  };
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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

  // Bare "/dashboard" or an unknown "/dashboard/<tab>" (bad link, typo)
  // lands on overview instead. Client-side, not a server redirect() in
  // app/dashboard/page.tsx or [tab]/page.tsx: this layout is a Client
  // Component, and a server redirect() thrown by a nested page does not
  // reliably produce an HTTP redirect when its parent layout is one.
  useEffect(() => {
    const tab = pathname.split('/')[2];
    if (!tab || !PAGES.some((page) => page.id === tab)) {
      router.replace('/dashboard/overview');
    }
  }, [pathname, router]);

  const [entry] = useState(readEntryParams);
  const [notice, setNotice] = useState<PageNotice | null>(() => initialNotice(entry));
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

  const onSelectTab = (tab: string) => router.push(`/dashboard/${tab}`);

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

  // "/dashboard/billing" -> "billing"; bare "/dashboard" -> "overview".
  const activeTab = pathname.split('/')[2] ?? 'overview';

  const contextValue: DashboardDataValue = {
    tenant,
    calls,
    appointments,
    overview,
    billing,
    plans,
    invoices,
    addOns,
    phoneNumbers,
    sip,
    phoneSetup,
    access,
    error,
    saveTenant,
    resyncAssistant,
    setPaused,
    saveAppointment,
    cancelAppointment,
    resolveCall,
    verifyForwarding,
    changePlan,
    cancelSubscription,
    resumeSubscription,
    purchaseAddOn,
    cancelAddOn,
    buyNumber,
    releaseNumber,
    connectSip,
    disconnectSip,
    needsReviewCount,
    status,
    readOnly,
    locked,
    answeringStopped,
    onTrial,
    selectedCall,
    setSelectedCall,
    openAppointment,
    openAppointmentFromCall,
    showSetupPrompt,
    setShowSetupPrompt,
    onSelectTab,
  };

  return (
    <DashboardDataProvider value={contextValue}>
      <DashboardShell
        tenant={tenant}
        status={status}
        activeTab={activeTab}
        onSelectTab={onSelectTab}
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

        <ServiceAccessBanner access={access} onUpgrade={() => onSelectTab('billing')} />

        {locked && access && activeTab !== 'billing' ? (
          <LockedScreen access={access} onUpgrade={() => onSelectTab('billing')} />
        ) : (
          children
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
              onSelectTab('phone');
            }}
          />
        )}
      </DashboardShell>
    </DashboardDataProvider>
  );
}
