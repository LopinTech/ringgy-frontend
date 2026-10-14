'use client';

import { createContext, useContext } from 'react';
import type { Appointment, Call, TenantConfig, TenantStatus } from '@/types/schema';
import type {
  ApiAccess,
  ApiAddOns,
  ApiBilling,
  ApiInvoice,
  ApiOverview,
  ApiPhoneNumber,
  ApiPhoneSetup,
  ApiPlanCatalogue,
  ApiSip,
} from '@/lib/api-types';

/**
 * Everything a dashboard tab view needs, fetched and owned once by
 * `app/dashboard/layout.tsx` and handed down to whichever `[tab]/page.tsx`
 * is currently rendered — so switching tabs (now a real navigation) never
 * re-fetches or re-mounts the data layer.
 */
export interface DashboardDataValue {
  tenant: TenantConfig;
  calls: Call[];
  appointments: Appointment[];
  overview: ApiOverview | null;
  billing: ApiBilling | null;
  plans: ApiPlanCatalogue | null;
  invoices: ApiInvoice[];
  addOns: ApiAddOns | null;
  phoneNumbers: ApiPhoneNumber[];
  sip: ApiSip | null;
  phoneSetup: ApiPhoneSetup | null;
  access: ApiAccess | null;
  error: string | null;

  saveTenant: (updated: TenantConfig) => Promise<void>;
  resyncAssistant: () => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
  saveAppointment: (appointment: Partial<Appointment>) => Promise<void>;
  cancelAppointment: (id: string) => Promise<void>;
  resolveCall: (id: string) => Promise<void>;
  verifyForwarding: () => Promise<void>;
  changePlan: (planId: string) => Promise<void>;
  cancelSubscription: () => Promise<void>;
  resumeSubscription: () => Promise<void>;
  purchaseAddOn: (id: string) => Promise<string | null>;
  cancelAddOn: (purchaseId: string) => Promise<void>;
  buyNumber: (phoneNumber: string, country?: string) => Promise<void>;
  releaseNumber: (id: string) => Promise<void>;
  connectSip: (customerNumberE164?: string) => Promise<void>;
  disconnectSip: () => Promise<void>;

  needsReviewCount: number;
  status: TenantStatus;
  readOnly: boolean;
  locked: boolean;
  answeringStopped: boolean;
  onTrial: boolean;

  selectedCall: Call | null;
  setSelectedCall: React.Dispatch<React.SetStateAction<Call | null>>;
  openAppointment: (data?: Partial<Appointment>) => void;
  openAppointmentFromCall: (call: Call) => void;
  showSetupPrompt: boolean;
  setShowSetupPrompt: (show: boolean) => void;

  /** Navigates to another dashboard tab (pushes `/dashboard/<tab>`). */
  onSelectTab: (tab: string) => void;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

export const DashboardDataProvider = DashboardDataContext.Provider;

export function useDashboardData(): DashboardDataValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error('useDashboardData must be used within a dashboard route (app/dashboard/layout.tsx)');
  }
  return ctx;
}
