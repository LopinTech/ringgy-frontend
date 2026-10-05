'use client';

/**
 * Calls, with the detail panel beside the list rather than in a drawer over
 * it — picking a call now keeps the list in view.
 *
 * The mock shows a transcript in that panel. Nothing populates
 * `transcriptRef` yet, so what the panel shows instead is what the call
 * actually produced: the outcome, what the assistant captured, and why it
 * was flagged. A fabricated conversation would be worse than an empty one.
 */

import React, { useState } from 'react';
import { PhoneCall, PhoneOutgoing, CalendarPlus, Check } from 'lucide-react';
import type { Call } from '@/types/schema';
import { Card, Tag } from './ui';
import {
  CALL_FILTERS,
  matchesFilter,
  outcomeLabel,
  outcomeTone,
  type CallFilter,
} from './call-format';

interface CallsViewProps {
  calls: Call[];
  selectedCall: Call | null;
  onSelectCall: (call: Call) => void;
  onCreateAppointmentFromCall: (call: Call) => void;
  onMarkResolved: (callId: string) => void;
  /** Hides the actions that change anything (read-only after the trial). */
  readOnly?: boolean;
}

export const CallsView: React.FC<CallsViewProps> = ({
  calls,
  selectedCall,
  onSelectCall,
  onCreateAppointmentFromCall,
  onMarkResolved,
  readOnly = false,
}) => {
  const [filter, setFilter] = useState<CallFilter>('All');

  const filtered = calls.filter((call) => matchesFilter(call, filter));
  const active =
    filtered.find((call) => call.id === selectedCall?.id) ?? filtered[0] ?? null;

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        {CALL_FILTERS.map((name) => {
          const count =
            name === 'All'
              ? calls.length
              : calls.filter((call) => matchesFilter(call, name)).length;
          const on = filter === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setFilter(name)}
              className={`rounded-full border px-[15px] py-2 text-[13px] font-semibold transition ${
                on
                  ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                  : 'border-[#DDE1EA] bg-white text-[#26304A] hover:border-[#B9C3D8]'
              }`}
            >
              {name}
              <span className={on ? 'opacity-70' : 'text-[#8A93A6]'}> {count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-[18px] xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          {filtered.length === 0 ? (
            <p className="m-0 px-5 py-6 text-[13px] text-[#6B7488]">
              No calls match this filter.
            </p>
          ) : (
            filtered.map((call, index) => {
              const on = active?.id === call.id;
              return (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => onSelectCall(call)}
                  className={`flex w-full items-center gap-4 border-l-[3px] px-5 py-3.5 text-left transition ${
                    on
                      ? 'border-l-[#2F6BFF] bg-[#F6F8FE]'
                      : 'border-l-transparent bg-white hover:bg-[#FAFBFE]'
                  } ${index === filtered.length - 1 ? '' : 'border-b border-b-[#E4E8F0]'}`}
                >
                  <div className="min-w-[120px] flex-[1_1_140px]">
                    <div className="truncate text-[13.5px] font-bold">
                      {call.callerName}
                    </div>
                    <div className="mt-0.5 truncate text-[12.5px] text-[#6B7488]">
                      {call.summary}
                    </div>
                  </div>
                  <div className="hidden flex-none whitespace-nowrap text-[12.5px] text-[#6B7488] sm:block">
                    {call.timestamp}
                  </div>
                  <Tag tone={outcomeTone(call)}>{outcomeLabel(call)}</Tag>
                </button>
              );
            })
          )}
        </Card>

        {active && (
          <div className="rounded-[18px] bg-[#0E1526] px-[22px] py-5 xl:sticky xl:top-[100px]">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <div className="relative h-9 w-9 flex-none">
                <div className="animate-pulseRing absolute inset-0 rounded-full bg-[#2F6BFF] opacity-35" />
                <div className="relative grid h-9 w-9 place-items-center rounded-full bg-[#2F6BFF] text-white">
                  <PhoneCall className="h-4 w-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">
                  {active.callerName}
                </div>
                <div className="mt-0.5 truncate text-xs text-[#8A94AC]">
                  {active.callerPhone} · {active.timestamp} · {active.duration}
                </div>
              </div>
            </div>

            <dl className="flex flex-col gap-3 pt-4 text-[13px]">
              <div>
                <dt className="text-[10px] font-bold tracking-[.07em] text-[#8A94AC] uppercase">
                  Outcome
                </dt>
                <dd className="mt-1 m-0 text-[#D6DBE8]">{active.summary}</dd>
              </div>

              {active.extractedAppointment && (
                <div className="rounded-[13px] bg-white/[.07] px-3.5 py-3">
                  <dt className="text-[10px] font-bold tracking-[.07em] text-[#8A94AC] uppercase">
                    Captured on the call
                  </dt>
                  <dd className="m-0 mt-1.5 flex flex-col gap-1 text-[#D6DBE8]">
                    <span>{active.extractedAppointment.service}</span>
                    <span>{active.extractedAppointment.requestedTime}</span>
                    {active.extractedAppointment.address && (
                      <span>{active.extractedAppointment.address}</span>
                    )}
                    {active.extractedAppointment.priceEstimate && (
                      <span>{active.extractedAppointment.priceEstimate}</span>
                    )}
                  </dd>
                </div>
              )}

              {active.reviewReason && !active.isResolved && (
                <div className="rounded-[13px] bg-[#F0A93B]/15 px-3.5 py-3 text-[#F6CE8E]">
                  <dt className="text-[10px] font-bold tracking-[.07em] uppercase">
                    Flagged for review
                  </dt>
                  <dd className="m-0 mt-1.5">{active.reviewReason}</dd>
                </div>
              )}

            </dl>

            {/* What was actually said. The lines come from the Telnyx
                conversation the call produced, so a call the assistant
                answered has one whether it arrived by phone or through the
                browser test call. */}
            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-3 text-[10px] font-bold tracking-[.07em] text-[#8A94AC] uppercase">
                Transcript
              </div>

              {active.transcript.length === 0 ? (
                <p className="m-0 text-xs leading-[1.5] text-[#6D778F]">
                  No transcript for this call. It appears once Telnyx has
                  finished the conversation — recordings are not captured.
                </p>
              ) : (
                <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
                  {active.transcript.map((line) => {
                    const isCaller = line.speaker === 'customer';
                    return (
                      <div
                        key={line.id}
                        className={`flex ${isCaller ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-[1.5] ${
                            isCaller
                              ? 'rounded-[13px_13px_13px_4px] bg-white/[.07] text-[#D6DBE8]'
                              : 'rounded-[13px_13px_4px_13px] bg-[#2F6BFF] text-white'
                          }`}
                        >
                          <div className="mb-1 flex items-center gap-2 text-[10px] font-bold tracking-[.07em] uppercase opacity-60">
                            <span>{isCaller ? 'Caller' : 'AI receptionist'}</span>
                            {line.time && <span>{line.time}</span>}
                          </div>
                          {line.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-[18px] flex flex-wrap gap-2">
              <a
                href={`tel:${active.callerPhone.replace(/[^\d+]/g, '')}`}
                className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#2F6BFF] text-[13.5px] font-bold text-white no-underline transition hover:bg-[#1E4FD8] hover:no-underline"
              >
                <PhoneOutgoing className="h-4 w-4" />
                Call back
              </a>
              {!readOnly && (
              <button
                type="button"
                onClick={() => onCreateAppointmentFromCall(active)}
                className="flex h-[42px] flex-1 items-center justify-center gap-2 rounded-[10px] border border-white/15 text-[13.5px] font-semibold text-white transition hover:bg-white/10"
              >
                <CalendarPlus className="h-4 w-4" />
                Book job
              </button>
              )}
              {!readOnly && active.outcome === 'needs_review' && !active.isResolved && (
                <button
                  type="button"
                  onClick={() => onMarkResolved(active.id)}
                  className="flex h-[42px] w-full items-center justify-center gap-2 rounded-[10px] border border-white/15 text-[13.5px] font-semibold text-white transition hover:bg-white/10"
                >
                  <Check className="h-4 w-4" />
                  Mark reviewed
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};
