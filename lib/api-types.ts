/**
 * Shapes returned by the NestJS backend. Kept separate from
 * `types/schema.ts` (the shapes the UI components consume) because the two
 * were designed independently — `lib/mappers.ts` is the only place that
 * translates between them.
 */

export type ApiTenantStatus = 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED';
export type ApiProvisioningStatus = 'PENDING' | 'PROVISIONED' | 'FAILED';
export type ApiForwardingStatus =
  | 'NOT_STARTED'
  | 'PENDING_CUSTOMER_ACTION'
  | 'VERIFIED'
  | 'FAILED';
export type ApiAssistantSyncStatus = 'NEVER_SYNCED' | 'SYNCED' | 'STALE';
export type ApiAppointmentStatus = 'BOOKED' | 'CANCELLED' | 'NEEDS_REVIEW';
export type ApiCallOutcome =
  | 'APPOINTMENT_CREATED'
  | 'NO_ACTION'
  | 'TRANSFERRED'
  | 'NEEDS_REVIEW';

export interface ApiServiceItem {
  name: string;
  price?: string;
  duration?: string;
}

export type ApiDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface ApiDayHours {
  closed: boolean;
  /** 24-hour "HH:MM". Meaningless when `closed`. */
  open: string;
  close: string;
}

/**
 * Two shapes live in this column: the structured per-day map the Company
 * Profile hours selector and the signup wizard write, and the legacy
 * `{ display: "..." }` line older signups stored. `lib/business-hours.ts`
 * reads both.
 */
export type ApiHours = Partial<Record<ApiDayKey, ApiDayHours>> & {
  display?: string;
};

/** One picked service area with its own radius; drawn on the profile map. */
export interface ApiServiceArea {
  id: string;
  label: string;
  lat: number;
  lng: number;
  radiusMiles: number;
}

/** One voice offered by the picker; served by GET /voices. */
export interface ApiVoice {
  /** Telnyx voice id, e.g. "Telnyx.Ultra.<uuid>". */
  id: string;
  name: string;
  description: string;
  gender: 'Female' | 'Male';
  language: string;
}

export interface ApiVoiceCatalogue {
  languages: { code: string; label: string }[];
  voices: ApiVoice[];
}

/** A location-search hit from GET /me/geo/search. */
export interface ApiGeoResult {
  label: string;
  lat: number;
  lng: number;
  kind: string;
}

export interface ApiSession {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  tenant: { name: string; status: ApiTenantStatus };
}

export interface ApiTelnyxResource {
  phoneE164: string | null;
  provisioningStatus: ApiProvisioningStatus;
  provisioningError: string | null;
  forwardingStatus: ApiForwardingStatus;
  telnyxAssistantId: string | null;
  /** Whether the live Telnyx assistant reflects the saved profile. */
  assistantSyncStatus: ApiAssistantSyncStatus;
  assistantSyncedAt: string | null;
  assistantSyncError: string | null;
}

export interface ApiProfile {
  id: string;
  name: string;
  ownerEmail: string;
  ownerName: string | null;
  trade: string | null;
  services: ApiServiceItem[];
  hours: ApiHours;
  serviceAreas: ApiServiceArea[] | null;
  /** Summary derived from `serviceAreas` on save; never sent by the client. */
  serviceArea: string | null;
  pricingNotes: string | null;
  status: ApiTenantStatus;
  businessPhoneE164: string | null;
  carrier: string | null;
  customGreeting: string | null;
  emergencyFallbackNumber: string | null;
  /** Telnyx voice id and its language; null for tenants from before the voice step. */
  voice: string | null;
  language: string | null;
  smsAlertsEnabled: boolean;
  emailDigestEnabled: boolean;
  telnyxResource: ApiTelnyxResource | null;
}

export interface ApiAppointment {
  id: string;
  tenantId: string;
  customerName: string | null;
  customerPhone: string | null;
  requestedService: string | null;
  scheduledAt: string | null;
  notes: string | null;
  address: string | null;
  durationMinutes: number | null;
  priceEstimate: string | null;
  callControlId: string | null;
  status: ApiAppointmentStatus;
  /** Set once the appointment is mirrored in Google Calendar. */
  googleEventId: string | null;
  /** Why the last Google Calendar sync failed, if it did. */
  googleSyncError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Where appointments the assistant books are saved. */
export type ApiAppointmentDestination = 'DASHBOARD' | 'GOOGLE_CALENDAR' | 'BOTH';

export interface ApiGoogleCalendarStatus {
  /** False until the server has Google Calendar credentials configured. */
  available: boolean;
  destination: ApiAppointmentDestination;
  connection: {
    googleEmail: string;
    calendarId: string | null;
    calendarName: string | null;
    status: 'CONNECTED' | 'NEEDS_RECONNECT';
    lastError: string | null;
  } | null;
}

/** When the assistant may transfer callers to a person. */
export type ApiHandoverWindow = 'BUSINESS_HOURS' | 'AFTER_HOURS' | 'ALWAYS';

export interface ApiHandover {
  enabled: boolean;
  /** E.164. */
  primaryNumber: string | null;
  backupNumber: string | null;
  /** Transfer when the caller asks for a person. */
  onRequest: boolean;
  /** Transfer when the assistant cannot handle the call. */
  whenUnsure: boolean;
  window: ApiHandoverWindow;
  /** IANA zone the business hours are in. */
  timeZone: string | null;
  /** Whether weekly hours are set in Company profile. */
  hoursSet: boolean;
}

export interface ApiGoogleCalendar {
  id: string;
  name: string;
  primary: boolean;
}

/** One line of a call transcript, as stored by the conversation sync. */
export interface ApiTranscriptLine {
  role: 'assistant' | 'caller';
  text: string;
  at: string | null;
}

export interface ApiCall {
  id: string;
  callControlId: string;
  fromE164: string | null;
  toE164: string | null;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  finalCallStatus: string | null;
  outcome: ApiCallOutcome | null;
  resolvedAt: string | null;
  /** Telnyx's record of what was said, newest sync wins. */
  transcript: ApiTranscriptLine[] | null;
  conversationId: string | null;
  transcriptRef: string | null;
  appointment: ApiAppointment | null;
}

export interface ApiOverview {
  callsToday: number;
  callsYesterday: number;
  bookedAppointments: number;
  needsReviewCount: number;
  minutesUsedThisMonth: number;
}

/* ------------------------------------------------------------------ *
 * Billing, add-ons, phone numbers and SIP
 *
 * Money is integer cents unless a field says `CentsPerMin`, which is a
 * decimal number of cents (12 = $0.12/min). Nothing here carries what a
 * call costs Ringgy — customers only ever see their own prices.
 * ------------------------------------------------------------------ */

export interface ApiPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  includedMinutes: number;
  includedPhoneNumbers: number;
  overageCentsPerMin: number;
  overageEnabled: boolean;
  usageWarningPercent: number;
  features: string[];
  highlight: boolean;
}

/** GET /billing/plans — public, so the signup wizard can show it. */
/** The free trial new signups get, as the backoffice has set it. */
export interface ApiTrialTerms {
  enabled: boolean;
  durationDays: number;
  includedMinutes: number;
  maxPhoneNumbers: number;
  /** Whether answering stops once the trial minutes are used. */
  stopAtMinuteLimit: boolean;
  /** Days after the trial during which calls are still answered. */
  graceDays: number;
  /** Days after that during which the dashboard stays viewable. */
  readOnlyDays: number;
  releaseNumbers: boolean;
  /** Days after answering stops before trial numbers are released. */
  numberRetentionDays: number;
}

export interface ApiPlanCatalogue {
  plans: ApiPlan[];
  /** Missing from servers that predate the free trial. */
  trial?: ApiTrialTerms;
  pricePerMinuteCents: number | null;
  phoneNumberMonthlyCents: number | null;
  billingEnabled: boolean;
}

export type ApiSubscriptionStatus =
  | 'INCOMPLETE'
  | 'INCOMPLETE_EXPIRED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED'
  | 'UNPAID'
  | 'PAUSED';

export interface ApiSubscription {
  status: ApiSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  plan: ApiPlan;
}

export type ApiUsageState = 'ok' | 'approaching' | 'exceeded';

export interface ApiUsage {
  periodStart: string;
  periodEnd: string;
  usedMinutes: number;
  includedMinutes: number;
  includedUsedMinutes: number;
  includedRemainingMinutes: number;
  packMinutesRemaining: number;
  packMinutesUsed: number;
  overageMinutes: number;
  overageEnabled: boolean;
  overageCentsPerMin: number;
  estimatedOverageCents: number;
  /** 0–100, and past 100 once overage has started. */
  percentOfIncluded: number;
  warningPercent: number;
  state: ApiUsageState;
}

export interface ApiBilling {
  billingEnabled: boolean;
  subscription: ApiSubscription | null;
  usage: ApiUsage | null;
  phoneNumbers: {
    count: number;
    included: number;
    monthlyPriceCents: number | null;
    monthlyTotalCents: number;
  };
  pricePerMinuteCents: number | null;
}

export interface ApiInvoice {
  id: string;
  number: string | null;
  createdAt: string;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
  currency: string;
  status: string | null;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

export type ApiAddOnKind = 'MINUTE_PACK' | 'PHONE_NUMBER' | 'SERVICE';
export type ApiAddOnBillingType = 'ONE_TIME' | 'RECURRING';

export interface ApiAddOn {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: ApiAddOnKind;
  billingType: ApiAddOnBillingType;
  priceCents: number;
  minutes: number | null;
}

export interface ApiAddOnPurchase {
  id: string;
  status: 'ACTIVE' | 'CANCELED';
  quantity: number;
  unitPriceCents: number;
  minutesGranted: number | null;
  minutesRemaining: number | null;
  createdAt: string;
  canceledAt: string | null;
  addOn: ApiAddOn;
}

export interface ApiAddOns {
  available: ApiAddOn[];
  purchases: ApiAddOnPurchase[];
}

/** ONE_TIME add-ons go through Stripe Checkout; RECURRING ones are added straight away. */
export type ApiAddOnPurchaseResult = { url: string } | { purchaseId: string };

export type ApiPhoneNumberStatus = 'PENDING' | 'ACTIVE' | 'FAILED' | 'RELEASED';

export interface ApiPhoneNumber {
  id: string;
  phoneNumber: string;
  status: ApiPhoneNumberStatus;
  statusDetail: string | null;
  source: 'PURCHASED' | 'ADOPTED';
  locality: string | null;
  region: string | null;
  monthlyPriceCents: number | null;
  billing: 'INCLUDED' | 'BILLED' | 'UNBILLED' | 'NOT_BILLED';
  purchasedAt: string | null;
  isPrimary: boolean;
}

export interface ApiAvailableNumber {
  phoneNumber: string;
  locality: string | null;
  region: string | null;
  /** Telnyx hid the digits because the account is not verified yet. */
  masked: boolean;
  monthlyPriceCents: number | null;
}

export interface ApiNumberSearch {
  country?: string;
  areaCode?: string;
  locality?: string;
  region?: string;
  contains?: string;
  type?: 'local' | 'toll_free';
  limit?: number;
}

/** The phone choice made at signup, and whether it has been carried out. */
export interface ApiPhoneSetup {
  method: 'PURCHASE' | 'FORWARD' | 'SIP' | null;
  status: 'PENDING' | 'DONE' | 'FAILED' | null;
  phoneNumber: string | null;
  error: string | null;
}

export interface ApiSip {
  status: 'PENDING' | 'ACTIVE' | 'FAILED' | 'DISABLED';
  statusDetail: string | null;
  customerNumberE164: string | null;
  host: string;
  sipUri: string;
  transports: string[];
  codecs: string[];
  notes: string[];
  lastSyncedAt: string | null;
}

export type ApiAccessMode =
  | 'paid'
  | 'trial'
  | 'grace'
  | 'suspended'
  | 'expired'
  | 'lapsed'
  | 'none';

export interface ApiTrial {
  status: 'ACTIVE' | 'GRACE' | 'SUSPENDED' | 'EXPIRED' | 'CONVERTED';
  startedAt: string;
  endsAt: string;
  /** Live answering stops here if no plan has been chosen. */
  graceEndsAt: string;
  /** The read-only dashboard closes here. */
  readOnlyEndsAt: string;
  /** Null when trial numbers are kept. */
  numberReleaseAt: string | null;
  numbersReleasedAt: string | null;
  convertedAt: string | null;
  daysLeft: number;
  endingSoon: boolean;
  includedMinutes: number;
  usedMinutes: number;
  remainingMinutes: number;
  minutesExhausted: boolean;
  stopAtMinuteLimit: boolean;
  maxPhoneNumbers: number;
}

/** What the account can do right now (GET /me/access). */
export interface ApiAccess {
  mode: ApiAccessMode;
  canAnswerCalls: boolean;
  answeringStoppedReason: string | null;
  /** Changes are refused; everything can still be viewed. */
  readOnly: boolean;
  /** Only choosing a plan is offered. */
  locked: boolean;
  canBuyNumbers: boolean;
  trialNumbersRemaining: number | null;
  subscriptionStatus: ApiSubscriptionStatus | null;
  trial: ApiTrial | null;
  /** Trial numbers that will be released if no plan is chosen. */
  numbersAtRisk: string[];
}
