'use client';

/**
 * Nine-step signup onboarding. Everything the wizard collects is sent in a
 * single `POST /auth/register` at the end — there is no account until the
 * last step, so a visitor who abandons halfway leaves no half-built tenant
 * behind. The live preview on the right is illustrative, not real data.
 *
 * Signup no longer buys a phone number. The plan picked here is paid for on
 * Stripe Checkout straight after the account is created, and Checkout sends
 * the owner back to the dashboard's phone tab to get a number or connect
 * SIP. A server without billing skips Checkout and lands on the dashboard.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Loader2,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  formatCents,
  formatPerMinute,
  isBillingUnavailable,
  redirectTo,
} from '@/lib/billing';
import { toE164 } from '@/lib/mappers';
import { formatTime } from '@/lib/business-hours';
import type {
  ApiDayKey,
  ApiGeoResult,
  ApiHours,
  ApiPlanCatalogue,
  ApiServiceArea,
  ApiVoice,
  ApiVoiceCatalogue,
} from '@/lib/api-types';
import { useAuth } from '@/components/auth/AuthProvider';
import { Logo } from '@/components/brand/Logo';

/**
 * The same MapLibre map the Company Profile picker draws. It reaches for
 * `window` at import time, so it must never run during the server render.
 */
const ServiceAreaMap = dynamic(
  () => import('@/components/ui/ServiceAreaMap').then((m) => m.ServiceAreaMap),
  {
    ssr: false,
    loading: () => (
      <div className="mt-3 grid aspect-[16/10] w-full place-items-center rounded-[14px] border border-[#E4E8F0] bg-[#F2F4F8]">
        <Loader2 className="h-5 w-5 animate-spin text-[#8A93A6]" />
      </div>
    ),
  },
);

/* ------------------------------------------------------------------ *
 * Static content
 * ------------------------------------------------------------------ */

const STEPS = [
  {
    id: 'account',
    key: 'Account',
    title: "Let's get your AI receptionist set up",
    sub: 'Create your account to start answering calls, texts, and customer questions automatically.',
  },
  {
    id: 'business',
    key: 'Business',
    title: 'Tell us about your business',
    sub: 'This helps your AI receptionist understand who you are and what you do.',
  },
  {
    id: 'phone',
    key: 'Phone number',
    title: 'Which number do your customers call?',
    sub: "We'll use this number to connect your customers with your AI receptionist.",
  },
  {
    id: 'areas',
    key: 'Service area',
    title: 'Where do you take jobs?',
    sub: 'Pick the areas you cover. Your AI receptionist will only book jobs inside them.',
  },
  {
    id: 'services',
    key: 'Services',
    title: 'What services do you offer?',
    sub: 'Tell your AI receptionist what you can help customers with.',
  },
  {
    id: 'hours',
    key: 'Hours',
    title: 'When are you available?',
    sub: 'Your AI receptionist can handle customers even when your team is unavailable.',
  },
  {
    id: 'voice',
    key: 'Voice',
    title: 'How should your receptionist sound?',
    sub: 'Pick the language and voice your customers will hear when they call.',
  },
  {
    id: 'plan',
    key: 'Plan',
    title: 'Choose your plan',
    sub: 'Every plan answers calls 24/7 and never cuts a caller off. Change or cancel any time.',
  },
  { id: 'ready', key: 'Ready', title: 'Your AI receptionist is ready', sub: '' },
] as const;

const LAST_STEP = STEPS.length - 1;

/**
 * The chip row is a shortcut, not the full taxonomy — "Other" reveals a
 * free-text field so a trade that is missing here can never block signup.
 * The value reaches the API as free text either way.
 */
const TRADE_CHIPS = [
  'Plumbing',
  'HVAC',
  'Electrical',
  'Roofing',
  'Cleaning',
  'Landscaping',
];

const OTHER = 'Other';

/** Matches the backend's fallback, so an unreachable catalogue still submits. */
const DEFAULT_LANGUAGE = 'en-US';
const GENDERS: ('Female' | 'Male')[] = ['Female', 'Male'];

/**
 * What the sample says. The backend builds the spoken text from the same
 * wording (see `voice-catalog.ts`) — it is written there rather than sent
 * from here so the preview endpoint cannot be used as an open
 * text-to-speech service, and repeated here so the caption matches what is
 * actually read aloud.
 */
function sampleSentence(businessName: string, language: string): string {
  const name = businessName.trim() || 'your business';

  switch (language) {
    case 'es-MX':
      return `Gracias por llamar a ${name}. Puedo agendar una visita, darle precios o tomar un mensaje — ¿en qué le ayudo?`;
    case 'fr-CA':
      return `Merci d'appeler ${name}. Je peux planifier une visite, donner les tarifs ou prendre un message — que puis-je faire pour vous ?`;
    default:
      return `Thanks for calling ${name}. I can book a visit, share pricing, or take a message — what do you need?`;
  }
}

/** The waveform in the sample card; heights are decorative, not real audio. */
const WAVE_BARS = Array.from({ length: 18 }, (_, index) => ({
  key: index,
  height: 18 + ((index * 7919) % 30),
  delay: `${(index * 0.06).toFixed(2)}s`,
}));

/**
 * One radius for every area picked here, rather than a slider each: signup
 * is not the place to tune coverage town by town, and Company Profile lets
 * an owner set them individually afterwards.
 */
const DEFAULT_RADIUS_MILES = 15;
const MIN_RADIUS_MILES = 1;
const MAX_RADIUS_MILES = 100;
const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

const NUMBER_STEPS = [
  'You keep this number. Nothing about it changes today.',
  'We give you a forwarding setting so unanswered calls ring your AI receptionist instead of voicemail.',
  'Turn forwarding on or off any time — your team can always pick up first.',
];

/* ------------------------------------------------------------------ *
 * Local shapes
 * ------------------------------------------------------------------ */

interface ServiceRow {
  name: string;
  price: string;
  duration: string;
}

/**
 * Hours are edited as three rows rather than seven, because that is how
 * these businesses describe their week. `days` is what each row expands to
 * when the structured per-day map is built for the API.
 */
interface HourRow {
  label: string;
  days: ApiDayKey[];
  from: string;
  to: string;
  open: boolean;
}

const INITIAL_HOURS: HourRow[] = [
  {
    label: 'Mon–Fri',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    from: '07:00',
    to: '18:00',
    open: true,
  },
  { label: 'Saturday', days: ['sat'], from: '08:00', to: '14:00', open: true },
  { label: 'Sunday', days: ['sun'], from: '09:00', to: '13:00', open: false },
];

function toApiHours(rows: HourRow[]): ApiHours {
  const hours: ApiHours = {};
  for (const row of rows) {
    for (const day of row.days) {
      hours[day] = { closed: !row.open, open: row.from, close: row.to };
    }
  }
  return hours;
}

/** "(555) 234-8900" while typing; anything non-US is left as entered. */
function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') || digits.length > 10) return value;
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

/* ------------------------------------------------------------------ *
 * Shared class strings
 * ------------------------------------------------------------------ */

const FIELD =
  'h-12 px-3.5 rounded-xl border border-[#DDE1EA] bg-[#FCFCFD] text-[15px] text-[#0E1526] placeholder:text-[#A6AEBF] outline-none transition focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/12';
const LABEL = 'text-[13px] font-semibold text-[#26304A]';
const CARD = 'rounded-[14px] border border-[#E4E8F0]';

export const OnboardingWizard: React.FC = () => {
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [business, setBusiness] = useState('');
  const [person, setPerson] = useState('');
  const [trade, setTrade] = useState<string>(TRADE_CHIPS[0]);
  const [tradeOther, setTradeOther] = useState('');
  const [phone, setPhone] = useState('');
  const [services, setServices] = useState<ServiceRow[]>([
    { name: '', price: '', duration: '' },
  ]);
  const [hours, setHours] = useState<HourRow[]>(INITIAL_HOURS);

  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [gender, setGender] = useState<'Female' | 'Male'>('Female');
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<ApiVoiceCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  const [areas, setAreas] = useState<ApiServiceArea[]>([]);
  const [radiusMiles, setRadiusMiles] = useState(DEFAULT_RADIUS_MILES);
  const [areaQuery, setAreaQuery] = useState('');
  const [areaResults, setAreaResults] = useState<ApiGeoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [planCatalogue, setPlanCatalogue] = useState<ApiPlanCatalogue | null>(null);
  const [planLoadFailed, setPlanLoadFailed] = useState(false);
  const [pickedPlanId, setPickedPlanId] = useState<string | null>(null);

  const meta = STEPS[step];
  const stepId = meta.id;
  const bizLabel = business.trim() || 'your business';
  const tradeLabel = (trade === OTHER ? tradeOther.trim() : trade) || 'service';
  const namedServices = services
    .map((service) => service.name.trim())
    .filter(Boolean);
  const openRows = hours.filter((row) => row.open);

  // The catalogue is fetched once, when the wizard mounts: it is a small
  // static list, and having it ready before the voice step means the picker
  // never renders empty.
  useEffect(() => {
    let active = true;

    api
      .voices()
      .then((found) => {
        if (!active) return;
        setCatalogue(found);
        setCatalogueError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCatalogueError(
          error instanceof Error
            ? error.message
            : 'Could not load the voice list.',
        );
      });

    return () => {
      active = false;
    };
  }, []);

  // Plans are public and small, so they are fetched up front like the
  // voices. A failure only means signup skips Checkout, never that it stops.
  useEffect(() => {
    let active = true;

    api
      .plans()
      .then((found) => {
        if (active) setPlanCatalogue(found);
      })
      .catch(() => {
        if (active) setPlanLoadFailed(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const plans = planCatalogue?.plans ?? [];
  const billingEnabled = Boolean(planCatalogue?.billingEnabled) && plans.length > 0;
  // The highlighted plan is the default until the visitor picks another.
  const chosenPlan =
    plans.find((plan) => plan.id === pickedPlanId) ??
    plans.find((plan) => plan.highlight) ??
    plans[0] ??
    null;

  // Stop any sample that is still playing when the wizard goes away.
  useEffect(
    () => () => {
      previewAbortRef.current?.abort();
      audioRef.current?.pause();
    },
    [],
  );

  const languages = catalogue?.languages ?? [];
  const voicesForChoice: ApiVoice[] = (catalogue?.voices ?? []).filter(
    (voice) => voice.language === language && voice.gender === gender,
  );
  const selectedVoice =
    voicesForChoice.find((voice) => voice.id === voiceId) ??
    voicesForChoice[0] ??
    null;

  const sampleLine = sampleSentence(business, language);

  const stopPreview = () => {
    previewAbortRef.current?.abort();
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingVoiceId(null);
  };

  const playPreview = async (voice: ApiVoice) => {
    if (playingVoiceId === voice.id) {
      stopPreview();
      return;
    }

    stopPreview();
    setPreviewError(null);
    setPlayingVoiceId(voice.id);

    const controller = new AbortController();
    previewAbortRef.current = controller;

    try {
      const clip = await api.previewVoice(
        voice.id,
        business.trim(),
        controller.signal,
      );
      if (controller.signal.aborted) return;

      // The object URL is released when the clip ends, so a visitor who
      // auditions every voice does not leak one blob per play.
      const url = URL.createObjectURL(clip);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setPlayingVoiceId((current) => (current === voice.id ? null : current));
      };
      await audio.play();
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setPlayingVoiceId(null);
      setPreviewError(
        error instanceof Error
          ? error.message
          : 'Could not play that sample. Try again in a moment.',
      );
    }
  };

  // The spinner and the cleared results belong to the keystroke that caused
  // them; the effect below stays purely about fetching.
  const onAreaQueryChange = (value: string) => {
    setAreaQuery(value);

    if (value.trim().length < MIN_QUERY_LENGTH) {
      setAreaResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
  };

  useEffect(() => {
    const trimmed = areaQuery.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    // Debounced, and the in-flight request is cancelled on every keystroke:
    // the geocoder is rate limited, and a late response for an older query
    // would show results the visitor has already typed past.
    const timer = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      api
        .publicGeoSearch(trimmed, controller.signal)
        .then((found) => {
          setAreaResults(found);
          setIsSearching(false);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchError(
            error instanceof Error
              ? error.message
              : 'Could not search for that location.',
          );
          setIsSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [areaQuery]);

  const addArea = (result: ApiGeoResult) => {
    const id = `${result.lat.toFixed(4)},${result.lng.toFixed(4)}`;

    // Adding the same town twice would draw two identical circles and tell
    // the assistant about it twice.
    if (!areas.some((area) => area.id === id)) {
      setAreas((current) => [
        ...current,
        { id, label: result.label, lat: result.lat, lng: result.lng, radiusMiles },
      ]);
    }

    // Cleared so the next area can be typed straight away — most businesses
    // add several in a row.
    onAreaQueryChange('');
  };

  const removeArea = (id: string) =>
    setAreas((current) => current.filter((area) => area.id !== id));

  // The radius is shared, so moving it moves every circle at once.
  const changeRadius = (miles: number) => {
    setRadiusMiles(miles);
    setAreas((current) =>
      current.map((area) => ({ ...area, radiusMiles: miles })),
    );
  };

  const patchService = (index: number, key: keyof ServiceRow, value: string) =>
    setServices((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );

  const patchHour = <K extends keyof HourRow>(
    index: number,
    key: K,
    value: HourRow[K],
  ) =>
    setHours((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
    );

  /** What blocks the current step, or null when it is complete. */
  const stepError = useMemo((): string | null => {
    if (stepId === 'account') {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        return 'Enter the email address you want to sign in with';
      }
      if (password.length < 12) {
        return 'Password must be at least 12 characters long';
      }
      return null;
    }
    if (stepId === 'business') {
      if (!business.trim()) return 'Tell us what your business is called';
      if (trade === OTHER && !tradeOther.trim()) return 'Name your trade';
      return null;
    }
    if (stepId === 'phone') {
      if (phone.replace(/\D/g, '').length < 10) {
        return 'Enter the number your customers call today';
      }
      return null;
    }
    if (stepId === 'services') {
      if (namedServices.length === 0) {
        return 'Add at least one service you offer';
      }
      return null;
    }
    if (stepId === 'hours') {
      const backwards = hours.find((row) => row.open && row.to <= row.from);
      if (backwards) {
        return `${backwards.label} closing time must be after the opening time`;
      }
      return null;
    }
    if (stepId === 'plan' && !planCatalogue && !planLoadFailed) {
      return 'Plans are still loading — one moment';
    }
    return null;
  }, [
    planCatalogue,
    planLoadFailed,
    stepId,
    email,
    password,
    business,
    trade,
    tradeOther,
    phone,
    namedServices.length,
    hours,
  ]);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.register({
        email: email.trim(),
        password,
        businessName: business.trim(),
        ownerName: person.trim() || undefined,
        trade: trade === OTHER ? tradeOther.trim() : trade,
        services: services
          .filter((service) => service.name.trim())
          .map((service) => ({
            name: service.name.trim(),
            price: service.price.trim() || undefined,
            duration: service.duration.trim() || undefined,
          })),
        hours: toApiHours(hours),
        serviceAreas: areas.length ? areas : undefined,
        voice: selectedVoice?.id,
        language: selectedVoice ? language : undefined,
        businessPhoneE164: toE164(phone),
      });
      await refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Something went wrong',
      );
      setIsSubmitting(false);
      return;
    }

    // The account exists from here on, so nothing below may send the visitor
    // back into the wizard: every failure lands on the dashboard, where the
    // plan can be chosen again from Billing.
    if (!billingEnabled || !chosenPlan) {
      router.push('/?billing=unavailable');
      return;
    }

    try {
      const { url } = await api.startCheckout(
        chosenPlan.id,
        '/?billing=success&setup=number',
        '/?tab=billing&billing=cancelled',
      );
      redirectTo(url);
    } catch (checkoutError) {
      router.push(
        isBillingUnavailable(checkoutError)
          ? '/?billing=unavailable'
          : '/?tab=billing',
      );
    }
  };

  const next = () => {
    if (stepError) {
      setError(stepError);
      return;
    }
    setError(null);
    if (step === LAST_STEP) {
      void submit();
      return;
    }
    setStep((current) => Math.min(LAST_STEP, current + 1));
  };

  const back = () => {
    setError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  const summary = [
    { label: 'Business', value: business.trim() || '—' },
    { label: 'Trade', value: tradeLabel },
    {
      label: 'Service area',
      value: areas.length
        ? `${
            areas.length > 3
              ? `${areas
                  .slice(0, 3)
                  .map((area) => area.label)
                  .join(', ')} + ${areas.length - 3} more`
              : areas.map((area) => area.label).join(', ')
          } · ${radiusMiles} mi`
        : 'Anywhere — no areas set',
    },
    {
      label: 'Voice',
      value: selectedVoice
        ? `${selectedVoice.name} · ${
            languages.find((entry) => entry.code === language)?.label ?? language
          }`
        : 'Standard voice',
    },
    {
      label: 'Services',
      value:
        namedServices.length > 2
          ? `${namedServices.slice(0, 2).join(', ')} + ${
              namedServices.length - 2
            } more`
          : namedServices.join(', ') || 'None added yet',
    },
    ...(billingEnabled && chosenPlan
      ? [
          {
            label: 'Plan',
            value: `${chosenPlan.name} · ${formatCents(chosenPlan.priceCents)}/mo`,
          },
        ]
      : []),
    {
      label: 'Hours',
      value: openRows.length
        ? openRows
            .map(
              (row) =>
                `${row.label} ${formatTime(row.from)}–${formatTime(row.to)}`,
            )
            .join(' · ')
        : 'Closed all week',
    },
  ];

  const shownError = error ?? null;

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ---------------------------------------------------------- *
       * Left: the wizard
       * ---------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col px-7 pt-10 pb-9 sm:px-12 xl:px-[76px]">
        <Logo className="mb-11" />

        <div className="mb-3.5 flex gap-1.5">
          {STEPS.map((entry, index) => (
            <div
              key={entry.key}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= step ? 'bg-[#2F6BFF]' : 'bg-[#E4E8F0]'
              }`}
            />
          ))}
        </div>
        <div className="mb-8 text-[12.5px] font-semibold text-[#8A93A6]">
          Step {step + 1} of {STEPS.length} · {meta.key}
        </div>

        <div className="w-full max-w-[460px] flex-1">
          <div key={step} className="animate-floatIn">
            <h1 className="mb-2.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.03em] text-[#0E1526] xl:text-[33px]">
              {meta.title}
            </h1>
            <p className="mb-7 text-[15px] leading-[1.55] text-pretty text-[#5C6579]">
              {stepId === 'ready'
                ? `We've got everything we need to set up your receptionist for ${bizLabel}.`
                : meta.sub}
            </p>

            {stepId === 'account' && (
              <div className="flex flex-col gap-[18px]">
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Email</span>
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@yourbusiness.com"
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Password</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 12 characters"
                    className={FIELD}
                  />
                </label>
              </div>
            )}

            {stepId === 'business' && (
              <div className="flex flex-col gap-[18px]">
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Business name</span>
                  <input
                    value={business}
                    onChange={(event) => setBusiness(event.target.value)}
                    placeholder="Apex Plumbing & Home Services"
                    className={FIELD}
                  />
                </label>
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Your name</span>
                  <input
                    value={person}
                    onChange={(event) => setPerson(event.target.value)}
                    placeholder="Dan Vance"
                    className={FIELD}
                  />
                </label>
                <div className="flex flex-col gap-2.5">
                  <span className={LABEL}>Trade</span>
                  <div className="flex flex-wrap gap-2">
                    {[...TRADE_CHIPS, OTHER].map((name) => {
                      const selected = trade === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setTrade(name)}
                          className={`rounded-full border px-[15px] py-2.5 text-[13.5px] font-semibold transition ${
                            selected
                              ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                              : 'border-[#DDE1EA] bg-white text-[#26304A] hover:border-[#B9C3D8]'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                  {trade === OTHER && (
                    <input
                      value={tradeOther}
                      onChange={(event) => setTradeOther(event.target.value)}
                      placeholder="Chimney & Fireplace"
                      className={`${FIELD} mt-1`}
                    />
                  )}
                </div>
              </div>
            )}

            {stepId === 'phone' && (
              <div className="flex flex-col gap-[18px]">
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Current business number</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) =>
                      setPhone(formatPhone(event.target.value))
                    }
                    placeholder="(555) 234-8900"
                    className={FIELD}
                  />
                </label>
                <p className="m-0 text-[13px] leading-[1.5] text-[#5C6579]">
                  This is the number your customers already call. After setup,
                  you can forward calls to your AI receptionist.
                </p>
                <div className={`${CARD} bg-[#F8FAFF] px-[18px] pt-[18px] pb-4`}>
                  <div className="mb-3.5 text-xs font-bold tracking-[.08em] text-[#2F6BFF] uppercase">
                    What happens to your number
                  </div>
                  <div className="flex flex-col gap-[13px]">
                    {NUMBER_STEPS.map((text, index) => (
                      <div key={text} className="flex items-start gap-[11px]">
                        <div className="mt-px grid h-5 w-5 flex-none place-items-center rounded-full bg-[#2F6BFF] text-[11px] font-bold text-white">
                          {index + 1}
                        </div>
                        <div className="text-[13.5px] leading-[1.5] text-[#26304A]">
                          {text}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {stepId === 'areas' && (
              <div>
                <div className="relative mb-3.5">
                  <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#9AA2B4]" />
                  <input
                    value={areaQuery}
                    onChange={(event) => onAreaQueryChange(event.target.value)}
                    placeholder="Search a city, town, neighbourhood or ZIP…"
                    autoComplete="off"
                    aria-label="Search for a service area"
                    className="h-[50px] w-full rounded-xl border border-[#DDE1EA] bg-[#FCFCFD] pr-10 pl-[38px] text-[14.5px] text-[#0E1526] placeholder:text-[#A6AEBF] outline-none focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/12"
                  />
                  {isSearching && (
                    <Loader2 className="absolute top-1/2 right-3.5 h-4 w-4 -translate-y-1/2 animate-spin text-[#9AA2B4]" />
                  )}
                  {!isSearching && areaQuery && (
                    <button
                      type="button"
                      onClick={() => onAreaQueryChange('')}
                      aria-label="Clear search"
                      className="absolute top-1/2 right-2.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-[#EEF0F5] text-[#6B7488]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {areas.length > 0 && (
                  <div className="mb-3.5 flex flex-wrap gap-[7px]">
                    {areas.map((area) => (
                      <button
                        key={area.id}
                        type="button"
                        onClick={() => removeArea(area.id)}
                        aria-label={`Remove ${area.label}`}
                        className="flex items-center gap-[7px] rounded-full border border-[#C9D8FF] bg-[#EEF3FF] px-[11px] py-[7px] text-[13px] font-semibold text-[#1E4FD8] transition hover:bg-[#E2EAFF]"
                      >
                        {area.label}
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    ))}
                  </div>
                )}

                {searchError && (
                  <p className="mb-3 text-[13px] font-medium text-rose-600">
                    {searchError}
                  </p>
                )}

                {areaResults.length > 0 && (
                  <div className="mb-3 grid gap-[9px] sm:grid-cols-2">
                    {areaResults.map((result) => {
                      const id = `${result.lat.toFixed(4)},${result.lng.toFixed(4)}`;
                      const picked = areas.some((area) => area.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() =>
                            picked ? removeArea(id) : addArea(result)
                          }
                          className={`flex items-center gap-[11px] rounded-xl border px-[13px] py-3 text-left transition ${
                            picked
                              ? 'border-[#2F6BFF] bg-[#F5F8FF]'
                              : 'border-[#E4E8F0] bg-[#FCFCFD] hover:border-[#B9C3D8]'
                          }`}
                        >
                          <span
                            className={`grid h-[19px] w-[19px] flex-none place-items-center rounded-md border text-[11px] font-bold text-white ${
                              picked
                                ? 'border-[#2F6BFF] bg-[#2F6BFF]'
                                : 'border-[#DDE1EA] bg-white'
                            }`}
                          >
                            {picked ? '✓' : ''}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold text-[#0E1526]">
                              {result.label}
                            </span>
                            <span className="mt-px block text-xs text-[#6B7488]">
                              {result.kind}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isSearching &&
                  !searchError &&
                  areaQuery.trim().length >= MIN_QUERY_LENGTH &&
                  areaResults.length === 0 && (
                    <div className={`${CARD} mb-3 bg-[#FCFCFD] p-[18px] text-[13.5px] text-[#6B7488]`}>
                      No places matched “{areaQuery.trim()}”. Try the nearest
                      town or a ZIP code.
                    </div>
                  )}

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[13px] font-semibold text-[#5C6579]">
                    {areas.length === 1
                      ? '1 area selected'
                      : `${areas.length} areas selected`}
                  </div>
                  {areas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAreas([])}
                      className="text-[13px] font-bold text-[#2F6BFF] hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                <div className={`${CARD} mt-3 bg-[#FCFCFD] px-[15px] py-3.5`}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className={LABEL}>How far out do you travel?</span>
                    <span className="text-[13px] font-bold tabular-nums text-[#0E1526]">
                      {radiusMiles} mi
                    </span>
                  </div>
                  <input
                    type="range"
                    min={MIN_RADIUS_MILES}
                    max={MAX_RADIUS_MILES}
                    step={1}
                    value={radiusMiles}
                    aria-label="Service radius around each area, in miles"
                    onChange={(event) =>
                      changeRadius(Number(event.target.value))
                    }
                    className="w-full accent-[#2F6BFF]"
                  />
                  <p className="mt-1 text-xs text-[#6B7488]">
                    Applied to every area you pick. You can set them
                    individually later in your profile.
                  </p>
                </div>

                {/* The map lives in this column, beside the picker that
                    feeds it — the panel on the right is a static product
                    shot now, and a map that far from its controls was hard
                    to connect to what had just been picked. */}
                <ServiceAreaMap
                  areas={areas}
                  className="mt-3 aspect-[16/10] w-full overflow-hidden rounded-[14px] border border-[#E4E8F0] bg-[#F2F4F8]"
                />

                <p className="m-0 mt-3.5 text-[13px] leading-[1.5] text-[#5C6579]">
                  Callers outside these areas still get answered — your
                  receptionist takes a message instead of booking a visit.
                </p>
              </div>
            )}

            {stepId === 'services' && (
              <div className="flex flex-col gap-2.5">
                {services.map((service, index) => (
                  <div
                    key={index}
                    className={`${CARD} flex flex-col gap-2.5 bg-[#FCFCFD] px-3.5 py-3.5`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        value={service.name}
                        onChange={(event) =>
                          patchService(index, 'name', event.target.value)
                        }
                        placeholder="Service name"
                        className="h-[42px] min-w-0 flex-1 rounded-[10px] border border-[#DDE1EA] bg-white px-3 text-[14.5px] font-semibold text-[#0E1526] outline-none focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/12"
                      />
                      <button
                        type="button"
                        title="Remove"
                        aria-label={`Remove ${service.name || 'service'}`}
                        onClick={() =>
                          setServices((rows) =>
                            rows.length === 1
                              ? [{ name: '', price: '', duration: '' }]
                              : rows.filter((_, i) => i !== index),
                          )
                        }
                        className="grid h-[42px] w-[38px] flex-none place-items-center rounded-[10px] border border-[#E4E8F0] bg-white text-[#9AA2B4] transition hover:text-[#0E1526]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        value={service.price}
                        onChange={(event) =>
                          patchService(index, 'price', event.target.value)
                        }
                        placeholder="$150–$250"
                        className="h-10 w-full min-w-0 rounded-[10px] border border-[#DDE1EA] bg-white px-3 text-[13.5px] text-[#0E1526] outline-none focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/12"
                      />
                      <input
                        value={service.duration}
                        onChange={(event) =>
                          patchService(index, 'duration', event.target.value)
                        }
                        placeholder="1–2 hrs"
                        className="h-10 w-full min-w-0 rounded-[10px] border border-[#DDE1EA] bg-white px-3 text-[13.5px] text-[#0E1526] outline-none focus:border-[#2F6BFF] focus:ring-4 focus:ring-[#2F6BFF]/12"
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setServices((rows) => [
                      ...rows,
                      { name: '', price: '', duration: '' },
                    ])
                  }
                  className="mt-1 h-[50px] rounded-[13px] border border-dashed border-[#C6CDDB] bg-white text-sm font-bold text-[#2F6BFF] transition hover:border-[#2F6BFF] hover:bg-[#F8FAFF]"
                >
                  Add another service +
                </button>
              </div>
            )}

            {stepId === 'hours' && (
              <>
                <div className={`${CARD} overflow-hidden`}>
                  {hours.map((row, index) => (
                    <div
                      key={row.label}
                      className={`flex flex-col gap-2.5 bg-[#FCFCFD] px-3.5 py-3 ${
                        index === hours.length - 1
                          ? ''
                          : 'border-b border-[#E4E8F0]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2.5">
                        <div className="text-sm font-bold text-[#0E1526]">
                          {row.label}
                        </div>
                        <button
                          type="button"
                          onClick={() => patchHour(index, 'open', !row.open)}
                          className={`flex-none rounded-full border px-[13px] py-1.5 text-[12.5px] font-semibold transition ${
                            row.open
                              ? 'border-[#DDE1EA] bg-white text-[#5C6579]'
                              : 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                          }`}
                        >
                          {row.open ? 'Mark closed' : 'Set hours'}
                        </button>
                      </div>
                      {row.open ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            aria-label={`${row.label} opening time`}
                            value={row.from}
                            onChange={(event) =>
                              patchHour(index, 'from', event.target.value)
                            }
                            className="h-10 min-w-[118px] flex-1 rounded-[10px] border border-[#DDE1EA] bg-white px-2.5 text-[13.5px] text-[#0E1526] outline-none focus:border-[#2F6BFF]"
                          />
                          <span className="text-[13px] text-[#9AA2B4]">–</span>
                          <input
                            type="time"
                            aria-label={`${row.label} closing time`}
                            value={row.to}
                            onChange={(event) =>
                              patchHour(index, 'to', event.target.value)
                            }
                            className="h-10 min-w-[118px] flex-1 rounded-[10px] border border-[#DDE1EA] bg-white px-2.5 text-[13.5px] text-[#0E1526] outline-none focus:border-[#2F6BFF]"
                          />
                        </div>
                      ) : (
                        <div className="text-[13.5px] font-medium text-[#9AA2B4]">
                          Closed — calls still answered by your AI receptionist.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-[#E4E8F0] bg-[#F8FAFF] px-[15px] py-3.5">
                  <div className="h-2 w-2 flex-none rounded-full bg-[#14B87A]" />
                  <div className="text-[13px] text-[#26304A]">
                    Outside these hours your AI receptionist answers every call,
                    24/7.
                  </div>
                </div>
              </>
            )}

            {stepId === 'voice' && (
              <div className="flex flex-col gap-[22px]">
                <label className="flex flex-col gap-2.5">
                  <span className={LABEL}>Language</span>
                  <select
                    value={language}
                    onChange={(event) => {
                      stopPreview();
                      setLanguage(event.target.value);
                      setVoiceId(null);
                    }}
                    className={`${FIELD} cursor-pointer`}
                  >
                    {(languages.length
                      ? languages
                      : [{ code: DEFAULT_LANGUAGE, label: 'English (US)' }]
                    ).map((entry) => (
                      <option key={entry.code} value={entry.code}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-col gap-2.5">
                  <span className={LABEL}>Voice gender</span>
                  <div className="flex flex-wrap gap-2">
                    {GENDERS.map((name) => {
                      const on = gender === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            stopPreview();
                            setGender(name);
                            setVoiceId(null);
                          }}
                          className={`rounded-full border px-[15px] py-2.5 text-[13.5px] font-semibold transition ${
                            on
                              ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                              : 'border-[#DDE1EA] bg-white text-[#26304A] hover:border-[#B9C3D8]'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <span className={LABEL}>Choose a voice</span>

                  {catalogueError && (
                    <p className="m-0 text-[13px] text-amber-700">
                      {catalogueError} Your receptionist will use the standard
                      voice until you pick one in your profile.
                    </p>
                  )}

                  {!catalogue && !catalogueError && (
                    <div className="flex items-center gap-2 text-[13px] text-[#6B7488]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading voices…
                    </div>
                  )}

                  {catalogue && voicesForChoice.length === 0 && (
                    <p className="m-0 text-[13px] text-[#6B7488]">
                      No {gender.toLowerCase()} voice in this language yet — try
                      the other one.
                    </p>
                  )}

                  <div className="flex flex-col gap-2.5">
                    {voicesForChoice.map((voice) => {
                      const on = selectedVoice?.id === voice.id;
                      const isPlaying = playingVoiceId === voice.id;
                      return (
                        <div
                          key={voice.id}
                          className={`flex items-center gap-3.5 rounded-[13px] border px-3.5 py-3.5 transition ${
                            on
                              ? 'border-[#2F6BFF] bg-[#F4F7FF]'
                              : 'border-[#E4E8F0] bg-[#FCFCFD]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setVoiceId(voice.id)}
                            className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
                          >
                            <span
                              className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-full text-[12.5px] font-extrabold ${
                                on
                                  ? 'bg-[#2F6BFF] text-white'
                                  : 'bg-[#EEF3FF] text-[#2F6BFF]'
                              }`}
                            >
                              {voice.name.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[14.5px] font-bold text-[#0E1526]">
                                {voice.name}
                              </span>
                              <span className="mt-0.5 block text-[12.5px] text-[#6B7488]">
                                {voice.description} · {voice.gender}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void playPreview(voice)}
                            aria-label={
                              isPlaying
                                ? `Stop the ${voice.name} sample`
                                : `Play the ${voice.name} sample`
                            }
                            className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-full border transition ${
                              isPlaying
                                ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                                : 'border-[#DDE1EA] bg-white text-[#2F6BFF] hover:border-[#2F6BFF]'
                            }`}
                          >
                            {isPlaying ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={`${CARD} bg-[#F8FAFF] px-[18px] py-[17px]`}>
                  <div className="mb-2.5 text-xs font-bold tracking-[.08em] text-[#2F6BFF] uppercase">
                    Sample sentence
                  </div>
                  <div className="text-sm leading-[1.55] text-pretty text-[#26304A]">
                    {sampleLine}
                  </div>
                  <div className="mt-[15px] flex items-center gap-3.5">
                    <div className="flex h-[34px] min-w-0 flex-1 items-center gap-[3px]">
                      {WAVE_BARS.map((bar) => (
                        <div
                          key={bar.key}
                          className="min-w-0 flex-1 rounded-full bg-[#2F6BFF] opacity-75 transition-[height] duration-300"
                          style={{
                            height: playingVoiceId ? `${bar.height}px` : '5px',
                            transitionDelay: bar.delay,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex-none text-[12.5px] font-semibold whitespace-nowrap text-[#5C6579]">
                      {playingVoiceId
                        ? 'Playing sample…'
                        : selectedVoice
                          ? `Tap play to hear ${selectedVoice.name} read this.`
                          : 'Pick a voice to hear it.'}
                    </div>
                  </div>
                  {previewError && (
                    <p className="m-0 mt-2.5 text-[12.5px] text-amber-700">
                      {previewError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {stepId === 'plan' && (
              <div className="flex flex-col gap-3">
                {!planCatalogue && !planLoadFailed && (
                  <div className="flex items-center gap-2 text-[13px] text-[#6B7488]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading plans…
                  </div>
                )}

                {(planLoadFailed || (planCatalogue && !billingEnabled)) && (
                  <div className={`${CARD} bg-[#F8FAFF] px-[18px] py-4 text-[13.5px] leading-[1.5] text-[#26304A]`}>
                    Billing isn&apos;t set up on this server yet, so there is
                    nothing to pay today. You can choose a plan later from your
                    dashboard.
                  </div>
                )}

                {billingEnabled &&
                  plans.map((plan) => {
                    const on = chosenPlan?.id === plan.id;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        onClick={() => setPickedPlanId(plan.id)}
                        className={`relative rounded-[14px] border px-[18px] py-4 text-left transition ${
                          on
                            ? 'border-[#2F6BFF] bg-[#F4F7FF] ring-4 ring-[#2F6BFF]/10'
                            : 'border-[#E4E8F0] bg-[#FCFCFD] hover:border-[#B9C3D8]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[16px] font-extrabold text-[#0E1526]">
                                {plan.name}
                              </span>
                              {plan.highlight && (
                                <span className="rounded-full bg-[#2F6BFF] px-2.5 py-0.5 text-[11px] font-bold text-white">
                                  Most popular
                                </span>
                              )}
                            </div>
                            {plan.description && (
                              <div className="mt-0.5 text-[13px] text-[#6B7488]">
                                {plan.description}
                              </div>
                            )}
                          </div>
                          <div className="flex-none text-right">
                            <div className="text-[20px] font-extrabold text-[#0E1526]">
                              {formatCents(plan.priceCents)}
                            </div>
                            <div className="text-[12px] text-[#6B7488]">per month</div>
                          </div>
                        </div>
                        <div className="mt-2.5 text-[13px] font-semibold text-[#26304A]">
                          {plan.includedMinutes.toLocaleString()} minutes included
                          {plan.overageEnabled &&
                            ` · extra minutes ${formatPerMinute(plan.overageCentsPerMin)}`}
                        </div>
                        {plan.features.length > 0 && (
                          <ul className="m-0 mt-2.5 grid list-none gap-1.5 p-0 sm:grid-cols-2">
                            {plan.features.map((feature) => (
                              <li
                                key={feature}
                                className="flex items-start gap-1.5 text-[12.5px] text-[#5C6579]"
                              >
                                <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-[#2F6BFF]" />
                                {feature}
                              </li>
                            ))}
                          </ul>
                        )}
                      </button>
                    );
                  })}

                {billingEnabled && (
                  <p className="m-0 text-[13px] leading-[1.5] text-[#5C6579]">
                    You&apos;ll pay securely with Stripe after creating your
                    account. Then you pick your receptionist&apos;s phone
                    number — or connect your existing phone system.
                  </p>
                )}
              </div>
            )}

            {stepId === 'ready' && (
              <div className={`${CARD} mb-2 overflow-hidden`}>
                {summary.map((row, index) => (
                  <div
                    key={row.label}
                    className={`flex gap-4 bg-[#FCFCFD] px-[18px] py-[15px] ${
                      index === summary.length - 1
                        ? ''
                        : 'border-b border-[#E4E8F0]'
                    }`}
                  >
                    <div className="w-[92px] flex-none text-[13px] font-semibold text-[#8A93A6]">
                      {row.label}
                    </div>
                    <div className="min-w-0 flex-1 text-sm font-semibold text-[#0E1526]">
                      {row.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 w-full max-w-[460px]">
          {shownError && (
            <div className="mb-3.5 flex items-start gap-2 rounded-xl border border-amber-400/50 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{shownError}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                type="button"
                onClick={back}
                disabled={isSubmitting}
                className="h-[52px] rounded-xl border border-[#DDE1EA] bg-white px-5 text-[14.5px] font-semibold text-[#26304A] transition hover:bg-[#F7F8FA] disabled:opacity-60"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={isSubmitting}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#0E1526] text-[15px] font-bold text-white transition hover:bg-[#2F6BFF] disabled:opacity-70"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {stepId === 'ready'
                ? billingEnabled
                  ? 'Create account & continue to payment'
                  : 'Create account & set up my AI'
                : 'Continue'}
            </button>
          </div>
          <div className="mt-[18px] text-center text-[13.5px] text-[#6B7488]">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-semibold text-[#2F6BFF] hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------- *
       * Right: what they are signing up to get
       * ---------------------------------------------------------- */}
      {/* The device is deliberately larger than the panel and anchored to
          its left edge, so it runs off the right the way the reference
          layout does — a product shot that continues past the frame reads
          as a window onto the app rather than a picture pasted into a box.
          `dashboard-preview.png` is the supplied screenshot trimmed of its
          transparent margin; its own shadow and transparency are kept, so
          the panel shows through behind it. */}
      <div className="relative hidden min-w-0 overflow-hidden bg-[#F2F4F8] lg:block">
        <Image
          src="/assets/images/dashboard-preview.png"
          alt="The Ringgy AI dashboard, showing answered calls, today's schedule and recent calls"
          width={1491}
          height={849}
          priority
          className="absolute top-1/2 left-[6%] w-[150%] max-w-none -translate-y-1/2"
        />
      </div>
    </div>
  );
};
