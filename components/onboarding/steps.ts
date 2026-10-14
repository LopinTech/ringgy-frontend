/**
 * Plain data, deliberately not in OnboardingWizard.tsx (a 'use client'
 * component): the Server Component at app/signup/[step]/page.tsx needs this
 * to validate the `step` route param, and a 'use client' module's
 * non-component exports aren't usable from server code — only its component
 * exports are.
 */
export const STEPS = [
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
    title: 'How should calls reach your receptionist?',
    sub: 'Pick a new number, forward the one you have, or connect your phone system. You can change this later.',
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

/** Every step id, filtering aside — for validating the `/signup/[step]` URL param. */
export const STEP_IDS: string[] = STEPS.map((entry) => entry.id);
