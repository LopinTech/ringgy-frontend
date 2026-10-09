import { loadHours, summarizeHours, toApiHours } from './business-hours';
import type {
  ApiAppointment,
  ApiCall,
  ApiProfile,
  ApiServiceItem,
} from './api-types';
import type {
  Appointment,
  AppointmentStatus,
  Call,
  CallOutcome,
  TenantConfig,
  TenantStatus,
} from '@/types/schema';

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';

  const digits = e164.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits;

  if (local.length !== 10) return e164;
  return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
}

/** "Today at 11:42 AM" / "Yesterday at 4:50 PM" / "Sep 1 at 9:15 AM". */
export function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Unknown time';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const time = date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  if (date >= startOfToday) return `Today at ${time}`;
  if (date >= new Date(startOfToday.getTime() - dayMs)) {
    return `Yesterday at ${time}`;
  }

  const day = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} at ${time}`;
}

/** "2m 14s" */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/* ------------------------------------------------------------------ *
 * Backend -> UI
 * ------------------------------------------------------------------ */

const CALL_OUTCOMES: Record<string, CallOutcome> = {
  APPOINTMENT_CREATED: 'booked',
  NEEDS_REVIEW: 'needs_review',
  TRANSFERRED: 'transferred',
  NO_ACTION: 'no_action',
};

const APPOINTMENT_STATUSES: Record<string, AppointmentStatus> = {
  BOOKED: 'confirmed',
  NEEDS_REVIEW: 'pending',
  CANCELLED: 'cancelled',
};

const ASSISTANT_SYNC: Record<string, TenantConfig['assistantSync']> = {
  NEVER_SYNCED: 'never',
  SYNCED: 'synced',
  STALE: 'stale',
};

const TENANT_STATUSES: Record<string, TenantStatus> = {
  ACTIVE: 'active',
  ONBOARDING: 'setup_incomplete',
  SUSPENDED: 'paused',
};

/**
 * Composed from the call's own data rather than an AI-written summary —
 * nothing generates those yet, and an invented one would misrepresent what
 * happened on the call.
 */
function describeCall(call: ApiCall): string {
  const appointment = call.appointment;

  if (appointment) {
    const service = appointment.requestedService ?? 'Service request';
    if (appointment.status === 'NEEDS_REVIEW') {
      return `${service} — details captured but flagged for review.`;
    }
    if (appointment.scheduledAt) {
      return `${service} — booked for ${formatTimestamp(appointment.scheduledAt)}.`;
    }
    return `${service} — appointment created.`;
  }

  if (call.finalCallStatus && call.finalCallStatus !== 'completed') {
    return `Call not connected (${call.finalCallStatus}).`;
  }

  if (call.outcome === 'TRANSFERRED') return 'Call transferred to a person.';
  return 'No appointment came out of this call.';
}

export function toCall(call: ApiCall): Call {
  const appointment = call.appointment;

  return {
    id: call.id,
    callControlId: call.callControlId,
    // The backend only knows the caller's number; a name exists only if the
    // assistant captured one into an appointment.
    callerName:
      appointment?.customerName ||
      formatPhone(call.fromE164) ||
      'Unknown caller',
    callerPhone: formatPhone(call.fromE164) || 'Unknown number',
    timestamp: formatTimestamp(call.startedAt),
    startedAtIso: call.startedAt ?? undefined,
    duration: formatDuration(call.durationSeconds),
    audioDurationSeconds: call.durationSeconds ?? 0,
    outcome: call.outcome ? CALL_OUTCOMES[call.outcome] : 'no_action',
    summary: describeCall(call),
    // Recordings are still not captured; the transcript comes from the
    // Telnyx conversation the call produced.
    recordingUrl: undefined,
    transcript: (call.transcript ?? []).map((line, index) => ({
      id: `${call.id}-${index}`,
      speaker: line.role === 'assistant' ? 'ai' : 'customer',
      time: line.at
        ? new Date(line.at).toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
          })
        : '',
      text: line.text,
    })),
    extractedAppointment: appointment
      ? {
          customerName: appointment.customerName ?? '',
          customerPhone: appointment.customerPhone ?? '',
          service: appointment.requestedService ?? '',
          requestedTime: appointment.scheduledAt
            ? formatTimestamp(appointment.scheduledAt)
            : 'No time captured',
          requestedTimeIso: appointment.scheduledAt ?? undefined,
          address: appointment.address ?? undefined,
          notes: appointment.notes ?? undefined,
          priceEstimate: appointment.priceEstimate ?? undefined,
        }
      : undefined,
    reviewReason:
      call.outcome === 'NEEDS_REVIEW'
        ? (appointment?.notes ??
          'The assistant could not fully complete this request.')
        : undefined,
    isResolved: call.resolvedAt !== null,
  };
}

export function toAppointment(appointment: ApiAppointment): Appointment {
  return {
    id: appointment.id,
    customerName: appointment.customerName ?? 'Unknown caller',
    customerPhone: formatPhone(appointment.customerPhone),
    service: appointment.requestedService ?? 'Service call',
    dateTime: appointment.scheduledAt
      ? formatTimestamp(appointment.scheduledAt)
      : 'Time not set',
    scheduledAtIso: appointment.scheduledAt ?? undefined,
    durationMinutes: appointment.durationMinutes ?? 60,
    address: appointment.address ?? '',
    notes: appointment.notes ?? '',
    status: APPOINTMENT_STATUSES[appointment.status] ?? 'pending',
    isAiCreated: appointment.callControlId !== null,
    callId: appointment.callControlId ?? undefined,
    priceEstimate: appointment.priceEstimate ?? undefined,
    googleCalendar: appointment.googleSyncError
      ? 'failed'
      : appointment.googleEventId
        ? 'synced'
        : undefined,
  };
}

export function toTenantConfig(profile: ApiProfile): TenantConfig {
  const loaded = loadHours(profile.hours);

  return {
    id: profile.id,
    businessName: profile.name,
    ownerName: profile.ownerName ?? '',
    email: profile.ownerEmail,
    trade: profile.trade ?? '',
    phoneNumber: formatPhone(profile.businessPhoneE164),
    // The owner's own line, where calls go when the assistant hands off.
    forwardingNumber: formatPhone(profile.emergencyFallbackNumber),
    aiPhoneNumber: formatPhone(profile.telnyxResource?.phoneE164 ?? null),
    status: TENANT_STATUSES[profile.status] ?? 'setup_incomplete',
    carrier: profile.carrier ?? '',
    isForwardingVerified:
      profile.telnyxResource?.forwardingStatus === 'VERIFIED',
    assistantSync: ASSISTANT_SYNC[
      profile.telnyxResource?.assistantSyncStatus ?? 'NEVER_SYNCED'
    ],
    assistantSyncError: profile.telnyxResource?.assistantSyncError ?? undefined,
    assistantId: profile.telnyxResource?.telnyxAssistantId ?? '',
    services: profile.services.map((service, index) => ({
      // The API has no per-service id; index is stable within a render and
      // the list is rewritten wholesale on save.
      id: `svc-${index}`,
      name: service.name,
      price: service.price ?? '',
      duration: service.duration ?? '',
    })),
    hours: loaded.days,
    hoursParsedFrom: loaded.source === 'structured' ? undefined : loaded.originalText,
    businessHours: summarizeHours(loaded.days),
    serviceAreas: profile.serviceAreas ?? [],
    serviceArea: profile.serviceArea ?? '',
    pricingNotes: profile.pricingNotes ?? '',
    voice: profile.voice ?? '',
    language: profile.language ?? '',
    smsAlertsEnabled: profile.smsAlertsEnabled,
    emailDigestEnabled: profile.emailDigestEnabled,
  };
}

/* ------------------------------------------------------------------ *
 * UI -> backend
 * ------------------------------------------------------------------ */

/** Digits only, E.164-ish. Empty input stays empty rather than becoming "+". */
export function toE164(value: string): string | undefined {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 0) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function servicesToApi(
  services: TenantConfig['services'],
): ApiServiceItem[] {
  return services
    .filter((service) => service.name.trim().length > 0)
    .map((service) => ({
      name: service.name,
      price: service.price || undefined,
      duration: service.duration || undefined,
    }));
}

export function tenantConfigToApi(
  config: TenantConfig,
): Record<string, unknown> {
  return {
    name: config.businessName,
    ownerName: config.ownerName || undefined,
    trade: config.trade || undefined,
    services: servicesToApi(config.services),
    hours: toApiHours(config.hours),
    // `serviceArea` (the summary line) is derived by the backend from these
    // and is deliberately not sent, so the two cannot disagree.
    serviceAreas: config.serviceAreas,
    pricingNotes: config.pricingNotes || undefined,
    voice: config.voice || undefined,
    language: config.language || undefined,
    businessPhoneE164: toE164(config.phoneNumber),
    carrier: config.carrier || undefined,
    // `forwardingNumber` is the only UI field backed by this column now that
    // the profile page's duplicate is gone. It used to send
    // `emergencyFallbackNumber` instead, which no screen edited — so every
    // save from the Account page silently wrote the old value back.
    emergencyFallbackNumber: toE164(config.forwardingNumber),
    smsAlertsEnabled: config.smsAlertsEnabled,
    emailDigestEnabled: config.emailDigestEnabled,
  };
}

const API_APPOINTMENT_STATUSES: Record<AppointmentStatus, string> = {
  confirmed: 'BOOKED',
  pending: 'NEEDS_REVIEW',
  completed: 'BOOKED',
  cancelled: 'CANCELLED',
};

export function appointmentToApi(
  appointment: Partial<Appointment>,
): Record<string, unknown> {
  return {
    customerName: appointment.customerName,
    customerPhone: appointment.customerPhone
      ? toE164(appointment.customerPhone)
      : undefined,
    requestedService: appointment.service,
    // The modal supplies a datetime-local value ("2026-09-04T14:00"), which
    // Date reads in the browser's own timezone — right for a local business.
    scheduledAt: appointment.dateTime
      ? toIsoOrUndefined(appointment.dateTime)
      : undefined,
    notes: appointment.notes,
    address: appointment.address,
    durationMinutes: appointment.durationMinutes,
    priceEstimate: appointment.priceEstimate,
    status: appointment.status
      ? API_APPOINTMENT_STATUSES[appointment.status]
      : undefined,
    callControlId: appointment.callId,
  };
}

function toIsoOrUndefined(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
