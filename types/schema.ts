export type CallOutcome = 'booked' | 'needs_review' | 'no_action' | 'transferred';

export interface CallTranscriptLine {
  id: string;
  speaker: 'ai' | 'customer' | 'system';
  time: string;
  text: string;
  highlight?: string;
}

export interface ExtractedAppointment {
  customerName: string;
  customerPhone: string;
  service: string;
  /** Human-readable, for display. */
  requestedTime: string;
  /** Absolute ISO datetime when the assistant captured one, for form prefill. */
  requestedTimeIso?: string;
  address?: string;
  notes?: string;
  priceEstimate?: string;
}

export interface Call {
  id: string;
  /**
   * Telnyx's own id for the call (CallSid / call_control_id). Distinct from
   * `id`, which is our database row id — appointments link to a call by
   * this value, not by `id`.
   */
  callControlId: string;
  callerName: string;
  callerPhone: string;
  /** Human-readable, for display: "Today at 11:42 AM". */
  timestamp: string;
  /** The same moment as an absolute ISO string, for grouping by day. */
  startedAtIso?: string;
  duration: string;
  audioDurationSeconds: number;
  outcome: CallOutcome;
  summary: string;
  recordingUrl?: string;
  transcript: CallTranscriptLine[];
  extractedAppointment?: ExtractedAppointment;
  reviewReason?: string;
  isResolved?: boolean;
}

export type AppointmentStatus = 'confirmed' | 'pending' | 'completed' | 'cancelled';

export interface Appointment {
  id: string;
  customerName: string;
  customerPhone: string;
  service: string;
  /** Human-readable, for display. */
  dateTime: string;
  /** The same moment as an absolute ISO string, for calendar placement. */
  scheduledAtIso?: string;
  durationMinutes: number;
  address: string;
  notes: string;
  status: AppointmentStatus;
  isAiCreated: boolean;
  callId?: string;
  priceEstimate?: string;
  /** Whether it is mirrored in Google Calendar, or the last sync failed. */
  googleCalendar?: 'synced' | 'failed';
}

export type TenantStatus = 'active' | 'setup_incomplete' | 'paused';

export interface ServiceItem {
  id: string;
  name: string;
  price: string;
  duration: string;
}

import type { BusinessHours } from '@/lib/business-hours';
import type { ApiServiceArea } from '@/lib/api-types';

export interface TenantConfig {
  id: string;
  businessName: string;
  ownerName: string;
  email: string;
  trade: string;
  phoneNumber: string;
  forwardingNumber: string;
  aiPhoneNumber: string;
  status: TenantStatus;
  carrier: string;
  isForwardingVerified: boolean;
  /**
   * Whether the live Telnyx assistant reflects the saved profile. `stale`
   * means the profile saved but the push to Telnyx failed, so callers still
   * hear the previous configuration.
   */
  assistantSync: 'never' | 'synced' | 'stale';
  assistantSyncError?: string;
  /**
   * The Telnyx assistant id. Safe in the browser: the WebRTC test call
   * authenticates with it alone, so no API key ever leaves the server.
   * Empty until provisioning has created the assistant.
   */
  assistantId: string;
  services: ServiceItem[];
  /** Per-day hours, as the Company Profile editor works with them. */
  hours: BusinessHours;
  /**
   * Set when `hours` was reconstructed from a legacy free-text line rather
   * than read back as saved, so the editor can say so.
   */
  hoursParsedFrom?: string;
  /** One-line summary of `hours`, for compact surfaces. */
  businessHours: string;
  /** The picked areas, each with its own radius. */
  serviceAreas: ApiServiceArea[];
  /** Summary of `serviceAreas`, derived by the backend on save. */
  serviceArea: string;
  pricingNotes: string;
  /** Telnyx voice id the assistant speaks with, and its language. */
  voice: string;
  language: string;
  /**
   * The owner's own line, where calls go when the assistant hands off.
   * Backed by the API's `emergencyFallbackNumber`; the Account page is the
   * one place it is edited.
   */
  smsAlertsEnabled: boolean;
  emailDigestEnabled: boolean;
}

export interface TenantAdmin {
  id: string;
  businessName: string;
  trade: string;
  ownerEmail: string;
  status: TenantStatus;
  plan: string;
  mrr: number;
  totalCallsThisMonth: number;
  aiResolutionRate: number;
  dateJoined: string;
}

export interface SystemMetrics {
  totalTenants: number;
  activeTenants: number;
  totalCallsToday: number;
  totalBookingsThisMonth: number;
  aiResolutionRatePct: number;
  avgCallDurationSec: number;
  mrrTotal: number;
}
