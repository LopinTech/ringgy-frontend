import {
  Building2,
  CalendarDays,
  CreditCard,
  Gauge,
  PhoneCall,
  PhoneForwarded,
  Settings,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

export interface PageMeta {
  id: string;
  label: string;
  title: string;
  sub: string;
  icon: LucideIcon;
}

/**
 * Plain data, deliberately not in DashboardShell.tsx (a 'use client'
 * component): Server Components (app/dashboard/[tab]/page.tsx) need to
 * import this to validate the `tab` route param, and a 'use client' module's
 * non-component exports aren't usable from server code — only its component
 * exports are. Tab ids are unchanged from the old state-driven dashboard, so
 * every existing handler keeps working.
 */
export const PAGES: PageMeta[] = [
  {
    id: 'overview',
    label: 'Overview',
    title: 'Overview',
    sub: 'How your AI receptionist performed this week.',
    icon: Gauge,
  },
  {
    id: 'calls',
    label: 'Calls',
    title: 'Calls',
    sub: 'Every call answered, with full transcripts.',
    icon: PhoneCall,
  },
  {
    id: 'appointments',
    label: 'Appointments',
    title: 'Appointments',
    sub: 'Jobs booked by your AI and your team.',
    icon: CalendarDays,
  },
  {
    id: 'assistant',
    label: 'Company profile',
    title: 'Company profile',
    sub: 'What your receptionist tells customers about you.',
    icon: Building2,
  },
  {
    id: 'phone',
    label: 'Phone number',
    title: 'Phone number',
    sub: 'Your numbers, SIP connection, and call forwarding.',
    icon: PhoneForwarded,
  },
  {
    id: 'billing',
    label: 'Billing and usage',
    title: 'Billing and usage',
    sub: 'Plan, minutes used, and invoices.',
    icon: CreditCard,
  },
  {
    id: 'settings',
    label: 'Settings',
    title: 'Settings',
    sub: 'Call handover, integrations, and where bookings are saved.',
    icon: Settings,
  },
  {
    id: 'account',
    label: 'Account',
    title: 'Account',
    sub: 'Your login, notifications, and team.',
    icon: UserRound,
  },
];
