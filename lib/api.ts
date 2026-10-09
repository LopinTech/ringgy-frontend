import type {
  ApiAccess,
  ApiAddOnPurchaseResult,
  ApiAddOns,
  ApiAppointment,
  ApiAppointmentDestination,
  ApiAvailableNumber,
  ApiBilling,
  ApiInvoice,
  ApiNumberSearch,
  ApiPhoneSetup,
  ApiPhoneNumber,
  ApiPlanCatalogue,
  ApiSip,
  ApiCall,
  ApiGeoResult,
  ApiGoogleCalendar,
  ApiGoogleCalendarStatus,
  ApiHandover,
  ApiHours,
  ApiOverview,
  ApiProfile,
  ApiServiceArea,
  ApiServiceItem,
  ApiVoiceCatalogue,
  ApiSession,
} from './api-types';

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * The session lives in an httpOnly cookie, so every request must send
 * credentials — and the backend's CORS config names this origin explicitly
 * because browsers reject a wildcard when credentials are included.
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await readError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // Nest sends a handler's `null` as an empty 200 body (GET /me/sip with no
  // connection), which `response.json()` would reject.
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'message' in body) {
      const { message } = body as { message: unknown };
      // Nest's ValidationPipe returns an array of messages.
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
    }
  } catch {
    // Fall through to the generic message below.
  }

  return `Request failed with status ${response.status}`;
}

export interface RegisterPayload {
  email: string;
  /** Left out when the account is created with Google. */
  password?: string;
  /** From `api.googleSignIn` for a Google account with no Ringgy account. */
  googleSignupToken?: string;
  businessName: string;
  ownerName?: string;
  trade?: string;
  services: ApiServiceItem[];
  hours: ApiHours;
  /** The picked areas; the backend derives the summary line from them. */
  serviceAreas?: ApiServiceArea[];
  /** Telnyx voice id and language picked on the voice step. */
  voice?: string;
  language?: string;
  pricingNotes?: string;
  businessPhoneE164?: string;
  carrier?: string;
  /** How calls will reach the receptionist, chosen on the phone step. */
  phoneSetup?: {
    method: 'PURCHASE' | 'FORWARD' | 'SIP';
    /** The Ringgy number picked (not for SIP); bought on the free trial, or once the plan is paid. */
    phoneNumber?: string;
  };
}

export interface GoogleSignup {
  signupToken: string;
  email: string;
  name: string | null;
}

export type GoogleSignInResult = { ok: true } | ({ ok: false } & GoogleSignup);

/** A number search as query parameters, empty filters left out. */
function searchParams(search: ApiNumberSearch): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export const api = {
  register: (payload: RegisterPayload) =>
    request<{ ok: true }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (email: string, password: string) =>
    request<{ ok: true }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /**
   * Signs in with a Google ID token. `ok: false` means the Google account has
   * no Ringgy account yet: finish the signup wizard with the signup token.
   */
  googleSignIn: (credential: string) =>
    request<GoogleSignInResult>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),

  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),

  session: () => request<ApiSession>('/auth/me'),

  profile: () => request<ApiProfile>('/me/profile'),

  updateProfile: (patch: Record<string, unknown>) =>
    request<ApiProfile>('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  overview: () => request<ApiOverview>('/me/overview'),

  calls: () => request<ApiCall[]>('/me/calls'),

  resolveCall: (id: string) =>
    request<ApiCall>(`/me/calls/${id}/resolve`, { method: 'POST' }),

  appointments: () => request<ApiAppointment[]>('/me/appointments'),

  createAppointment: (payload: Record<string, unknown>) =>
    request<ApiAppointment>('/me/appointments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAppointment: (id: string, payload: Record<string, unknown>) =>
    request<ApiAppointment>(`/me/appointments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  cancelAppointment: (id: string) =>
    request<{ ok: true }>(`/me/appointments/${id}`, { method: 'DELETE' }),

  verifyForwarding: () =>
    request<ApiProfile>('/me/phone/verify-forwarding', { method: 'POST' }),

  /**
   * Location search for the service-area picker. Proxied by the backend,
   * which owns the upstream's User-Agent requirement and rate limit.
   */
  geoSearch: (query: string, signal?: AbortSignal) =>
    request<ApiGeoResult[]>(`/me/geo/search?q=${encodeURIComponent(query)}`, {
      signal,
    }),

  /**
   * The voices the picker offers, checked against Telnyx's live catalogue by
   * the backend. Unauthenticated: the voice is chosen before the account
   * exists.
   */
  voices: () => request<ApiVoiceCatalogue>('/voices'),

  /**
   * A spoken sample of one voice, as MP3. The sentence is built server-side
   * from the business name — this is a billed Telnyx request, not an open
   * text-to-speech endpoint.
   */
  previewVoice: async (
    voiceId: string,
    businessName: string,
    signal?: AbortSignal,
  ): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/voices/preview`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceId, businessName }),
      signal,
    });

    if (!response.ok) {
      throw new ApiError(response.status, await readError(response));
    }

    return response.blob();
  },

  /**
   * The same search without a session, for the service-area step of signup —
   * there is no account yet at that point. Capped per IP by the backend, so
   * it can answer 429; the caller surfaces that as a retry hint.
   */
  publicGeoSearch: (query: string, signal?: AbortSignal) =>
    request<ApiGeoResult[]>(`/geo/search?q=${encodeURIComponent(query)}`, {
      signal,
    }),

  resyncAssistant: () =>
    request<ApiProfile>('/me/assistant/resync', { method: 'POST' }),

  retryProvisioning: () =>
    request<ApiProfile>('/me/retry-provisioning', { method: 'POST' }),

  /* -------------------------------------------------------------- *
   * Billing. Anything that needs Stripe answers 503 until the server
   * has a Stripe key; callers treat that as "billing not set up".
   * -------------------------------------------------------------- */

  /** The public plan list; also used by the signup wizard. */
  plans: () => request<ApiPlanCatalogue>('/billing/plans'),

  billing: () => request<ApiBilling>('/me/billing'),

  /** Trial or plan, whether calls are answered, whether changes are allowed. */
  access: () => request<ApiAccess>('/me/access'),

  /** Starts Stripe Checkout for a first plan; redirect to the returned url. */
  startCheckout: (planId: string, successPath?: string, cancelPath?: string) =>
    request<{ url: string }>('/me/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId, successPath, cancelPath }),
    }),

  /** Called on the way back from Checkout so the result shows at once. */
  confirmCheckout: (sessionId: string) =>
    request<{ status: string; paymentStatus: string }>(
      '/me/billing/checkout/confirm',
      { method: 'POST', body: JSON.stringify({ sessionId }) },
    ),

  changePlan: (planId: string) =>
    request<ApiBilling>('/me/billing/change-plan', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),

  cancelSubscription: () =>
    request<ApiBilling>('/me/billing/cancel', { method: 'POST' }),

  resumeSubscription: () =>
    request<ApiBilling>('/me/billing/resume', { method: 'POST' }),

  /** Stripe's customer portal: card, billing address, receipts. */
  billingPortal: (returnPath?: string) =>
    request<{ url: string }>('/me/billing/portal', {
      method: 'POST',
      body: JSON.stringify({ returnPath }),
    }),

  invoices: () => request<ApiInvoice[]>('/me/billing/invoices'),

  addOns: () => request<ApiAddOns>('/me/billing/add-ons'),

  purchaseAddOn: (id: string, quantity?: number) =>
    request<ApiAddOnPurchaseResult>(`/me/billing/add-ons/${id}/purchase`, {
      method: 'POST',
      body: JSON.stringify({ quantity }),
    }),

  cancelAddOn: (purchaseId: string) =>
    request<void>(`/me/billing/add-ons/purchases/${purchaseId}`, {
      method: 'DELETE',
    }),

  /* -------------------------------------------------------------- *
   * Phone numbers and SIP
   * -------------------------------------------------------------- */

  phoneNumbers: () => request<ApiPhoneNumber[]>('/me/phone-numbers'),

  searchNumbers: (search: ApiNumberSearch) =>
    request<ApiAvailableNumber[]>(
      `/me/phone-numbers/search?${searchParams(search)}`,
    ),

  /** The same search without a session, for the signup phone step. */
  publicSearchNumbers: (search: ApiNumberSearch) =>
    request<ApiAvailableNumber[]>(
      `/phone-numbers/search?${searchParams(search)}`,
    ),

  getPhoneSetup: () => request<ApiPhoneSetup>('/me/phone-setup'),

  /** Carries out the signup phone choice once the plan is paid; idempotent. */
  completePhoneSetup: () =>
    request<ApiPhoneSetup>('/me/phone-setup/complete', { method: 'POST' }),

  buyNumber: (phoneNumber: string, country?: string) =>
    request<Omit<ApiPhoneNumber, 'isPrimary'>>('/me/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber, country }),
    }),

  releaseNumber: (id: string) =>
    request<void>(`/me/phone-numbers/${id}`, { method: 'DELETE' }),

  sip: () => request<ApiSip | null>('/me/sip'),

  connectSip: (customerNumberE164?: string) =>
    request<ApiSip>('/me/sip', {
      method: 'POST',
      body: JSON.stringify({ customerNumberE164 }),
    }),

  disconnectSip: () => request<void>('/me/sip', { method: 'DELETE' }),

  handover: () => request<ApiHandover>('/me/handover'),

  updateHandover: (
    changes: Partial<Omit<ApiHandover, 'hoursSet' | 'timeZone'>> & {
      timeZone?: string;
    },
  ) =>
    request<ApiHandover>('/me/handover', {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  googleCalendar: () =>
    request<ApiGoogleCalendarStatus>('/me/integrations/google-calendar'),

  /** The Google consent URL to send the browser to. */
  connectGoogleCalendar: () =>
    request<{ url: string }>('/me/integrations/google-calendar/connect', {
      method: 'POST',
    }),

  googleCalendars: () =>
    request<ApiGoogleCalendar[]>('/me/integrations/google-calendar/calendars'),

  updateGoogleCalendar: (changes: {
    destination?: ApiAppointmentDestination;
    calendarId?: string;
  }) =>
    request<ApiGoogleCalendarStatus>('/me/integrations/google-calendar', {
      method: 'PATCH',
      body: JSON.stringify(changes),
    }),

  disconnectGoogleCalendar: () =>
    request<ApiGoogleCalendarStatus>('/me/integrations/google-calendar', {
      method: 'DELETE',
    }),
};
