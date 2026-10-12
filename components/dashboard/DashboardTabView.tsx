'use client';

import { useDashboardData } from './DashboardDataContext';
import { BillingBanner, StatusBanner } from './StatusBanner';
import { OverviewView } from './OverviewView';
import { CallsView } from './CallsView';
import { AppointmentsView } from './AppointmentsView';
import { CompanyProfileView } from './CompanyProfileView';
import { PhoneView } from './PhoneView';
import { BillingView } from './BillingView';
import { AccountView } from './AccountView';
import { HandoverCard } from './HandoverCard';
import { SettingsView } from './SettingsView';

/** Renders the one active dashboard section. The route (`[tab]`) already
 * decided which this is — no `activeTab === 'x'` branching needed here. */
export function DashboardTabView({ tab }: { tab: string }) {
  const d = useDashboardData();

  switch (tab) {
    case 'overview':
      return (
        <>
          {!d.answeringStopped && (
            <StatusBanner
              tenant={d.tenant}
              status={d.status}
              onStatusChange={(next) => void d.setPaused(next === 'paused')}
              onNavigateToTab={d.onSelectTab}
            />
          )}
          {!d.onTrial && !d.readOnly && (
            <BillingBanner billing={d.billing} onNavigateToTab={d.onSelectTab} />
          )}
          <OverviewView
            overview={d.overview}
            calls={d.calls}
            appointments={d.appointments}
            needsReviewCount={d.needsReviewCount}
            onSelectTab={d.onSelectTab}
            onSelectCall={(call) => {
              d.setSelectedCall(call);
              d.onSelectTab('calls');
            }}
          />
        </>
      );

    case 'calls':
      return (
        <CallsView
          calls={d.calls}
          selectedCall={d.selectedCall}
          readOnly={d.readOnly}
          onSelectCall={d.setSelectedCall}
          onCreateAppointmentFromCall={d.openAppointmentFromCall}
          onMarkResolved={(callId) => {
            void d.resolveCall(callId);
            d.setSelectedCall((current) =>
              current && current.id === callId
                ? { ...current, isResolved: true }
                : current,
            );
          }}
        />
      );

    case 'appointments':
      return (
        <AppointmentsView
          appointments={d.appointments}
          readOnly={d.readOnly}
          onOpenModal={d.openAppointment}
          onCancelAppointment={(id) => void d.cancelAppointment(id)}
        />
      );

    // A disabled fieldset turns every control in these forms off at once
    // while leaving the content readable.
    case 'assistant':
      return (
        <fieldset disabled={d.readOnly} className="contents">
          <CompanyProfileView
            tenant={d.tenant}
            onSaveTenant={(updated) => void d.saveTenant(updated)}
            onResyncAssistant={() => void d.resyncAssistant()}
          />
        </fieldset>
      );

    case 'phone':
      return (
        <fieldset disabled={d.readOnly} className="contents">
          <PhoneView
            tenant={d.tenant}
            billing={d.billing}
            access={d.access}
            phoneNumbers={d.phoneNumbers}
            sip={d.sip}
            phoneSetup={d.phoneSetup}
            showSetupPrompt={d.showSetupPrompt}
            onDismissSetupPrompt={() => d.setShowSetupPrompt(false)}
            onVerifyForwarding={() => void d.verifyForwarding()}
            onBuyNumber={d.buyNumber}
            onReleaseNumber={d.releaseNumber}
            onConnectSip={d.connectSip}
            onDisconnectSip={d.disconnectSip}
            onSelectTab={d.onSelectTab}
          />
        </fieldset>
      );

    case 'billing':
      return (
        <BillingView
          billing={d.billing}
          access={d.access}
          plans={d.plans}
          invoices={d.invoices}
          addOns={d.addOns}
          onChangePlan={d.changePlan}
          onCancel={d.cancelSubscription}
          onResume={d.resumeSubscription}
          onPurchaseAddOn={d.purchaseAddOn}
          onCancelAddOn={d.cancelAddOn}
        />
      );

    case 'settings':
      return (
        <fieldset disabled={d.readOnly} className="flex flex-col gap-[18px]">
          <HandoverCard />
          <SettingsView />
        </fieldset>
      );

    case 'account':
      return (
        <fieldset disabled={d.readOnly} className="contents">
          <AccountView
            tenant={d.tenant}
            onUpdateTenant={(updated) => void d.saveTenant(updated)}
          />
        </fieldset>
      );

    default:
      return null;
  }
}
