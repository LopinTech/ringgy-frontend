'use client';

/**
 * The dashboard chrome: a dark rail on the left, a white page header on the
 * right, and the active view between them. It replaces the old top-bar plus
 * horizontal-tabs layout entirely.
 *
 * The rail collapses into a slide-over below `lg`, because the seven
 * destinations do not fit a phone and this dashboard is opened from a truck
 * as often as from a desk.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Gauge,
  LogOut,
  Menu,
  PhoneCall,
  PhoneForwarded,
  UserRound,
  X,
} from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { initialsOf, SecondaryButton } from './ui';
import type { TenantConfig, TenantStatus } from '@/types/schema';

export interface PageMeta {
  id: string;
  label: string;
  title: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Tab ids are unchanged, so every existing handler keeps working. */
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
    id: 'account',
    label: 'Account',
    title: 'Account',
    sub: 'Your login, notifications, and team.',
    icon: UserRound,
  },
];


interface DashboardShellProps {
  tenant: TenantConfig;
  status: TenantStatus;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  needsReviewCount: number;
  /** Left out when live answering is off, which hides the test call. */
  onStartTestCall?: () => void;
  /** Live answering is off because the free trial (or the plan) ended. */
  answeringStopped?: boolean;
  onLogout: () => void;
  error?: string | null;
  children: React.ReactNode;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  tenant,
  status,
  activeTab,
  onSelectTab,
  needsReviewCount,
  onStartTestCall,
  answeringStopped = false,
  onLogout,
  error,
  children,
}) => {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A menu that only closed on its own items would be left hanging over the
  // page on the next click anywhere else.
  useEffect(() => {
    if (!isMenuOpen) return;

    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };

    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEscape);
    };
  }, [isMenuOpen]);

  const meta = PAGES.find((page) => page.id === activeTab) ?? PAGES[0];

  const select = (id: string) => {
    onSelectTab(id);
    setIsNavOpen(false);
  };

  const rail = (
    <div className="flex h-full flex-col gap-6 bg-[#0E1526] px-4 py-[22px]">
      <div className="flex items-center gap-2.5 px-2">
        <Logo tone="dark" className="flex-1" />
        <button
          type="button"
          onClick={() => setIsNavOpen(false)}
          aria-label="Close navigation"
          className="text-[#98A1B5] lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-[3px]">
        {PAGES.map((page) => {
          const isActive = page.id === activeTab;
          const badge = page.id === 'calls' ? needsReviewCount : 0;
          const Icon = page.icon;
          return (
            <button
              key={page.id}
              type="button"
              onClick={() => select(page.id)}
              className={`flex items-center gap-[11px] rounded-[10px] px-3 py-2.5 text-left text-[13.5px] transition ${
                isActive
                  ? 'bg-[#2F6BFF]/[.18] font-bold text-white'
                  : 'font-medium text-[#98A1B5] hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px] flex-none opacity-90" />
              <span className="min-w-0 flex-1 truncate">{page.label}</span>
              {badge > 0 && (
                <span className="rounded-full bg-[#2F6BFF] px-[7px] py-0.5 text-[10.5px] font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="rounded-[14px] border border-white/10 bg-white/5 p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`block h-[7px] w-[7px] rounded-full ${
              answeringStopped
                ? 'bg-[#F0625A]'
                : status === 'active'
                  ? 'bg-[#3DD598]'
                  : 'bg-[#F0A93B]'
            }`}
          />
          <span className="text-[12.5px] font-bold text-white">
            {answeringStopped
              ? 'Live answering stopped'
              : status === 'active'
                ? 'Receptionist live'
                : status === 'paused'
                  ? 'Receptionist paused'
                  : 'Setup incomplete'}
          </span>
        </div>
        <div className="text-xs leading-[1.5] text-[#8A94AC]">
          {answeringStopped
            ? 'Choose a plan to turn your receptionist back on.'
            : status === 'active'
              ? `Answering ${tenant.phoneNumber || 'your line'} around the clock.`
              : status === 'paused'
                ? 'Calls are going to voicemail until you resume.'
                : 'Finish forwarding so calls reach your receptionist.'}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F2F4F8] text-[#0E1526] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen lg:block">{rail}</aside>

      {isNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsNavOpen(false)}
          />
          <div className="animate-floatIn absolute inset-y-0 left-0 w-[268px]">
            {rail}
          </div>
        </div>
      )}

      <main className="flex min-w-0 flex-col">
        <header className={`sticky top-0 z-30 flex items-center gap-4 border-b border-[#E4E8F0] bg-white px-5 py-[18px] sm:px-8`}>
          <button
            type="button"
            onClick={() => setIsNavOpen(true)}
            aria-label="Open navigation"
            className="text-[#26304A] lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="m-0 truncate text-[19px] font-extrabold tracking-[-0.02em]">
              {meta.title}
            </h1>
            <div className="mt-[3px] truncate text-[13px] text-[#6B7488]">
              {meta.sub}
            </div>
          </div>

          {onStartTestCall && (
            <SecondaryButton onClick={onStartTestCall} className="hidden sm:inline-flex">
              Test call
            </SecondaryButton>
          )}

          <div ref={menuRef} className="relative border-l border-[#E4E8F0] pl-4">
            <button
              type="button"
              onClick={() => setIsMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 transition hover:bg-[#F7F8FA]"
            >
              <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-full bg-[#EEF3FF] text-[13px] font-extrabold text-[#2F6BFF]">
                {initialsOf(tenant.ownerName || tenant.businessName)}
              </span>
              <span className="hidden text-left leading-[1.25] sm:block">
                <span className="block text-[13px] font-bold">
                  {tenant.ownerName || 'Owner'}
                </span>
                <span className="block max-w-[160px] truncate text-[11.5px] text-[#8A93A6]">
                  {tenant.businessName}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 flex-none text-[#8A93A6] transition-transform ${
                  isMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isMenuOpen && (
              <div
                role="menu"
                className="animate-floatIn absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-[12px] border border-[#E4E8F0] bg-white py-1 shadow-[0_18px_40px_-20px_rgba(14,21,38,.35)]"
              >
                <div className="border-b border-[#E4E8F0] px-3.5 py-2.5">
                  <div className="text-[13px] font-bold">
                    {tenant.ownerName || 'Owner'}
                  </div>
                  <div className="truncate text-[11.5px] text-[#8A93A6]">
                    {tenant.email}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onSelectTab('account');
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#26304A] transition hover:bg-[#F7F8FA]"
                >
                  <UserRound className="h-4 w-4 text-[#8A93A6]" />
                  Account settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-semibold text-[#B4322C] transition hover:bg-[#FDF3F2]"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="border-b border-amber-400/50 bg-amber-50 px-5 py-2 text-center text-[12.5px] font-semibold text-amber-900 sm:px-8">
            {error}
          </div>
        )}

        <div
          key={activeTab}
          className="animate-floatIn flex flex-col gap-[18px] px-5 pt-7 pb-11 sm:px-8"
        >
          {children}
        </div>
      </main>
    </div>
  );
};
