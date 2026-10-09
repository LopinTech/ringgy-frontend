'use client';

/**
 * Where the receptionist's bookings go: the Ringgy dashboard, the owner's
 * Google Calendar, or both — and the Google connection that makes the
 * calendar options possible.
 *
 * Loads its own state rather than going through useDashboard: nothing else
 * in the dashboard needs it, and connecting round-trips through Google, so
 * the page has to read the outcome off the URL it comes back to anyway.
 */

import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, LayoutDashboard, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  ApiAppointmentDestination,
  ApiGoogleCalendar,
  ApiGoogleCalendarStatus,
} from '@/lib/api-types';
import {
  Card,
  CardTitle,
  ConfirmDialog,
  FIELD,
  LABEL,
  MUTED,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Tag,
} from './ui';

const DESTINATIONS: {
  id: ApiAppointmentDestination;
  title: string;
  body: string;
  needsCalendar: boolean;
}[] = [
  {
    id: 'DASHBOARD',
    title: 'Ringgy dashboard only',
    body: 'Bookings appear under Appointments, as they do today.',
    needsCalendar: false,
  },
  {
    id: 'GOOGLE_CALENDAR',
    title: 'Google Calendar only',
    body: 'Bookings go straight to your calendar. Ones without a confirmed time still come to the dashboard for review.',
    needsCalendar: true,
  },
  {
    id: 'BOTH',
    title: 'Ringgy dashboard and Google Calendar',
    body: 'Bookings appear under Appointments and are copied to your calendar. Edits and cancellations follow.',
    needsCalendar: true,
  },
];

type Outcome = 'connected' | 'cancelled' | 'failed' | 'expired';

const OUTCOMES: Record<
  Outcome,
  { tone: 'green' | 'blue' | 'amber'; title: string; body?: string }
> = {
  connected: {
    tone: 'green',
    title: 'Google Calendar connected',
    body: 'Choose the calendar bookings should go to, then where to save them.',
  },
  cancelled: {
    tone: 'blue',
    title: 'Google Calendar was not connected',
    body: 'You cancelled on Google’s screen. Nothing changed.',
  },
  failed: {
    tone: 'amber',
    title: 'Google Calendar could not be connected',
    body: 'Make sure you allow Ringgy to see your calendars and add events, then try again.',
  },
  expired: {
    tone: 'amber',
    title: 'That connection link expired',
    body: 'Press Connect Google Calendar to start again.',
  },
};

/** Reads `?googleCalendar=` once, then drops it so a refresh does not repeat it. */
function takeOutcome(): Outcome | null {
  const url = new URL(window.location.href);
  const value = url.searchParams.get('googleCalendar');
  if (!value) return null;
  url.searchParams.delete('googleCalendar');
  window.history.replaceState(null, '', url.toString());
  return value in OUTCOMES ? (value as Outcome) : null;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export const SettingsView: React.FC = () => {
  const [status, setStatus] = useState<ApiGoogleCalendarStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calendars, setCalendars] = useState<ApiGoogleCalendar[] | null>(null);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'calendar' | 'destination' | null>(
    null,
  );
  const [isConfirmingDisconnect, setIsConfirmingDisconnect] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const returned = takeOutcome();
      try {
        const next = await api.googleCalendar();
        if (!active) return;
        setStatus(next);
        setOutcome(returned);
      } catch (error) {
        if (active) setLoadError(messageOf(error, 'Could not load settings.'));
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const connection = status?.connection ?? null;
  const isConnected = connection?.status === 'CONNECTED';

  // The calendar list is only readable while the connection works, and is
  // fetched again whenever a different Google account is connected.
  const connectedEmail = isConnected ? connection.googleEmail : null;
  useEffect(() => {
    if (!connectedEmail) return;
    let active = true;

    api
      .googleCalendars()
      .then((found) => {
        if (!active) return;
        setCalendars(found);
        setCalendarsError(null);
      })
      .catch((error: unknown) => {
        if (active) {
          setCalendarsError(messageOf(error, 'Could not load your calendars.'));
        }
      });

    return () => {
      active = false;
    };
  }, [connectedEmail]);

  const connect = async () => {
    setActionError(null);
    setBusy('connect');
    try {
      const { url } = await api.connectGoogleCalendar();
      window.location.assign(url);
    } catch (error) {
      setActionError(messageOf(error, 'Could not start connecting.'));
      setBusy(null);
    }
  };

  const update = async (
    changes: { destination?: ApiAppointmentDestination; calendarId?: string },
    kind: 'calendar' | 'destination',
  ) => {
    setActionError(null);
    setBusy(kind);
    try {
      setStatus(await api.updateGoogleCalendar(changes));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (error) {
      setActionError(messageOf(error, 'Could not save that change.'));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setActionError(null);
    setStatus(await api.disconnectGoogleCalendar());
    setCalendars(null);
    setOutcome(null);
  };

  if (loadError) {
    return <Notice tone="red" title="Settings could not be loaded">{loadError}</Notice>;
  }
  if (!status) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-[#6B7488]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  const calendarReady = isConnected && Boolean(connection.calendarId);
  const statusTag = !connection ? (
    <Tag tone="grey">Not connected</Tag>
  ) : connection.status === 'NEEDS_RECONNECT' ? (
    <Tag tone="amber">Needs reconnecting</Tag>
  ) : connection.calendarId ? (
    <Tag tone="green">Connected</Tag>
  ) : (
    <Tag tone="blue">Choose a calendar</Tag>
  );

  return (
    <div className="flex flex-col gap-[18px]">
      {outcome && (
        <Notice
          tone={OUTCOMES[outcome].tone}
          title={OUTCOMES[outcome].title}
          onDismiss={() => setOutcome(null)}
        >
          {OUTCOMES[outcome].body}
        </Notice>
      )}
      {actionError && (
        <Notice tone="red" onDismiss={() => setActionError(null)}>
          {actionError}
        </Notice>
      )}
      {justSaved && (
        <div className="animate-fadeIn flex items-center gap-2 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Settings saved.
        </div>
      )}

      <div className="grid items-start gap-[18px] xl:grid-cols-2">
        <Card className="p-[22px]">
          <CardTitle title="Google Calendar" action={statusTag} className="mb-1.5" />
          <p className={`m-0 mb-4 text-[12.5px] ${MUTED}`}>
            Let your receptionist put bookings on your Google Calendar. Ringgy
            can only see your list of calendars and add or change the events
            it creates.
          </p>

          {!status.available ? (
            <Notice tone="blue" title="Not available on this server yet">
              Google Calendar has not been set up for Ringgy here.
            </Notice>
          ) : !connection ? (
            <PrimaryButton
              type="button"
              onClick={() => void connect()}
              disabled={busy === 'connect'}
            >
              {busy === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect Google Calendar
            </PrimaryButton>
          ) : (
            <div className="flex flex-col gap-4">
              {connection.status === 'NEEDS_RECONNECT' && (
                <Notice tone="amber" title="Syncing is paused">
                  {connection.lastError ??
                    'Google stopped accepting Ringgy’s access.'}{' '}
                  Bookings are being saved to the dashboard until you
                  reconnect.
                </Notice>
              )}

              <div>
                <div className={LABEL}>Google account</div>
                <div className="mt-1 text-[13.5px] font-semibold text-[#0E1526]">
                  {connection.googleEmail}
                </div>
              </div>

              {isConnected && (
                <label className="flex flex-col gap-[7px]">
                  <span className={LABEL}>Calendar for bookings</span>
                  {calendarsError ? (
                    <span className="text-[12.5px] text-[#B4322C]">
                      {calendarsError}
                    </span>
                  ) : (
                    <select
                      value={connection.calendarId ?? ''}
                      disabled={!calendars || busy === 'calendar'}
                      onChange={(event) =>
                        void update({ calendarId: event.target.value }, 'calendar')
                      }
                      className={FIELD}
                    >
                      {!connection.calendarId && (
                        <option value="" disabled>
                          {calendars ? 'Choose a calendar…' : 'Loading calendars…'}
                        </option>
                      )}
                      {connection.calendarId && !calendars && (
                        <option value={connection.calendarId}>
                          {connection.calendarName ?? connection.calendarId}
                        </option>
                      )}
                      {calendars?.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.name}
                          {calendar.primary ? ' (main calendar)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-xs text-[#8A93A6]">
                    Only calendars you can add events to are listed.
                  </span>
                </label>
              )}

              <div className="flex flex-wrap gap-2.5">
                <SecondaryButton
                  type="button"
                  onClick={() => void connect()}
                  disabled={busy === 'connect'}
                >
                  {busy === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isConnected ? 'Use a different account' : 'Reconnect'}
                </SecondaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() => setIsConfirmingDisconnect(true)}
                  className="text-[#B4322C]"
                >
                  Disconnect
                </SecondaryButton>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-[22px]">
          <CardTitle title="Where bookings are saved" className="mb-1.5" />
          <p className={`m-0 mb-4 text-[12.5px] ${MUTED}`}>
            For appointments your receptionist books on a call. Ones you add
            yourself always appear in the dashboard, and are copied to Google
            Calendar too when it is selected.
          </p>

          <div role="radiogroup" className="flex flex-col gap-2.5">
            {DESTINATIONS.map((option) => {
              const selected = status.destination === option.id;
              const unavailable = option.needsCalendar && !calendarReady;
              const Icon = option.needsCalendar ? CalendarDays : LayoutDashboard;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={unavailable || busy === 'destination'}
                  onClick={() =>
                    !selected &&
                    void update({ destination: option.id }, 'destination')
                  }
                  className={`flex items-start gap-3 rounded-[14px] border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${
                    selected
                      ? 'border-[#2F6BFF] bg-[#F4F7FF] ring-4 ring-[#2F6BFF]/10'
                      : 'border-[#E4E8F0] bg-white hover:border-[#C6CDDB]'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-2 ${
                      selected ? 'border-[#2F6BFF]' : 'border-[#C6CDDB]'
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-[#2F6BFF]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[13.5px] font-semibold text-[#0E1526]">
                      <Icon className="h-4 w-4 text-[#6B7488]" />
                      {option.title}
                    </span>
                    <span className="mt-1 block text-xs leading-[1.5] text-[#6B7488]">
                      {option.body}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {!calendarReady && (
            <p className="m-0 mt-3.5 text-xs text-[#8A93A6]">
              Connect Google Calendar and choose a calendar to use the Google
              options.
            </p>
          )}
        </Card>
      </div>

      {isConfirmingDisconnect && connection && (
        <ConfirmDialog
          title="Disconnect Google Calendar?"
          confirmLabel="Disconnect"
          danger
          onConfirm={disconnect}
          onClose={() => setIsConfirmingDisconnect(false)}
        >
          New bookings will be saved to the Ringgy dashboard only. Events
          already in {connection.googleEmail}’s calendar stay there.
        </ConfirmDialog>
      )}
    </div>
  );
};
