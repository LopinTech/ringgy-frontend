'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type {
  ApiAddOns,
  ApiBilling,
  ApiInvoice,
  ApiOverview,
  ApiPhoneNumber,
  ApiPlanCatalogue,
  ApiPhoneSetup,
  ApiSip,
} from './api-types';
import {
  appointmentToApi,
  tenantConfigToApi,
  toAppointment,
  toCall,
  toTenantConfig,
} from './mappers';
import type { Appointment, Call, TenantConfig } from '@/types/schema';

interface DashboardState {
  tenant: TenantConfig | null;
  calls: Call[];
  appointments: Appointment[];
  overview: ApiOverview | null;
  /** Null when `/me/billing` could not be read; the views degrade to "not set up". */
  billing: ApiBilling | null;
  /** The public plan list, for the plan picker. */
  plans: ApiPlanCatalogue | null;
  invoices: ApiInvoice[];
  addOns: ApiAddOns | null;
  phoneNumbers: ApiPhoneNumber[];
  sip: ApiSip | null;
  /** The phone choice made at signup and whether it has been carried out. */
  phoneSetup: ApiPhoneSetup | null;
  isLoading: boolean;
  error: string | null;
}

const EMPTY: DashboardState = {
  tenant: null,
  calls: [],
  appointments: [],
  overview: null,
  billing: null,
  plans: null,
  invoices: [],
  addOns: null,
  phoneNumbers: [],
  sip: null,
  phoneSetup: null,
  isLoading: true,
  error: null,
};

/**
 * Single owner of the dashboard's server data. Components keep consuming the
 * same `types/schema` shapes they were built against — everything is mapped
 * on the way in and out, so no view had to be rewritten to talk to the API.
 *
 * Mutations refetch rather than patching local state: a booking can also
 * arrive from a live phone call, so the server is the only reliable source
 * of what currently exists.
 */
export function useDashboard(enabled: boolean) {
  const [state, setState] = useState<DashboardState>(EMPTY);

  const load = useCallback(async () => {
    try {
      // Billing, numbers and SIP are fetched alongside but never fail the
      // load: a Stripe outage (or a server without a Stripe key) must not
      // take the calls and appointments down with it.
      const [
        profile,
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
      ] = await Promise.all([
        api.profile(),
        api.calls(),
        api.appointments(),
        api.overview(),
        api.billing().catch(() => null),
        api.plans().catch(() => null),
        api.invoices().catch(() => []),
        api.addOns().catch(() => null),
        api.phoneNumbers().catch(() => []),
        api.sip().catch(() => null),
        api.getPhoneSetup().catch(() => null),
      ]);

      setState({
        tenant: toTenantConfig(profile),
        calls: calls.map(toCall),
        appointments: appointments.map(toAppointment),
        overview,
        billing,
        plans,
        invoices,
        addOns,
        phoneNumbers,
        sip,
        phoneSetup,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load data',
      }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const saveTenant = useCallback(
    async (updated: TenantConfig) => {
      await api.updateProfile(tenantConfigToApi(updated));
      await load();
    },
    [load],
  );

  /**
   * Re-pushes the saved profile to Telnyx after a failed sync — the retry
   * behind the profile page's "not live yet" banner.
   */
  const resyncAssistant = useCallback(async () => {
    await api.resyncAssistant();
    await load();
  }, [load]);

  const setPaused = useCallback(
    async (paused: boolean) => {
      await api.updateProfile({ status: paused ? 'SUSPENDED' : 'ACTIVE' });
      await load();
    },
    [load],
  );

  const saveAppointment = useCallback(
    async (appointment: Partial<Appointment>) => {
      const payload = appointmentToApi(appointment);

      if (appointment.id) {
        await api.updateAppointment(appointment.id, payload);
      } else {
        await api.createAppointment(payload);
      }

      // A call that produced a flagged booking is dealt with once a human
      // has saved the appointment, so clear it from needs-attention too.
      if (!appointment.id && appointment.callId) {
        const call = state.calls.find(
          (c) => c.callControlId === appointment.callId,
        );
        if (call) {
          await api.resolveCall(call.id).catch(() => undefined);
        }
      }

      await load();
    },
    [load, state.calls],
  );

  const cancelAppointment = useCallback(
    async (id: string) => {
      await api.cancelAppointment(id);
      await load();
    },
    [load],
  );

  const resolveCall = useCallback(
    async (id: string) => {
      await api.resolveCall(id);
      await load();
    },
    [load],
  );

  const verifyForwarding = useCallback(async () => {
    await api.verifyForwarding();
    await load();
  }, [load]);

  const retryProvisioning = useCallback(async () => {
    await api.retryProvisioning();
    await load();
  }, [load]);

  /* -------------------------------------------------------------- *
   * Billing. The Stripe-hosted steps (checkout, one-time add-ons, the
   * portal) leave the page, so those only return the url to go to.
   * -------------------------------------------------------------- */

  const confirmCheckout = useCallback(
    async (sessionId: string) => {
      try {
        return await api.confirmCheckout(sessionId);
      } finally {
        // Even if the confirm call fails the webhook may already have landed.
        await load();
      }
    },
    [load],
  );

  /**
   * Carries out the phone choice made at signup (buy the picked number, or
   * open SIP) now that the plan is paid. Safe to repeat.
   */
  const completePhoneSetup = useCallback(async () => {
    try {
      return await api.completePhoneSetup();
    } finally {
      await load();
    }
  }, [load]);

  const changePlan = useCallback(
    async (planId: string) => {
      await api.changePlan(planId);
      await load();
    },
    [load],
  );

  const cancelSubscription = useCallback(async () => {
    await api.cancelSubscription();
    await load();
  }, [load]);

  const resumeSubscription = useCallback(async () => {
    await api.resumeSubscription();
    await load();
  }, [load]);

  /** Returns the Checkout url for a one-time add-on, or null once a recurring one is added. */
  const purchaseAddOn = useCallback(
    async (id: string): Promise<string | null> => {
      const result = await api.purchaseAddOn(id);
      if ('url' in result) return result.url;
      await load();
      return null;
    },
    [load],
  );

  const cancelAddOn = useCallback(
    async (purchaseId: string) => {
      await api.cancelAddOn(purchaseId);
      await load();
    },
    [load],
  );

  const buyNumber = useCallback(
    async (phoneNumber: string, country?: string) => {
      await api.buyNumber(phoneNumber, country);
      await load();
    },
    [load],
  );

  const releaseNumber = useCallback(
    async (id: string) => {
      await api.releaseNumber(id);
      await load();
    },
    [load],
  );

  const connectSip = useCallback(
    async (customerNumberE164?: string) => {
      await api.connectSip(customerNumberE164);
      await load();
    },
    [load],
  );

  const disconnectSip = useCallback(async () => {
    await api.disconnectSip();
    await load();
  }, [load]);

  return {
    ...state,
    reload: load,
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
    saveTenant,
    resyncAssistant,
    setPaused,
    saveAppointment,
    cancelAppointment,
    resolveCall,
    verifyForwarding,
    retryProvisioning,
  };
}
