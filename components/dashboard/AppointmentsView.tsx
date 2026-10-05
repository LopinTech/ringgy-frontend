'use client';

/**
 * The week the mock draws, over real appointments: five columns, jobs placed
 * by their scheduled time, coloured by whether the assistant or the team
 * booked them.
 *
 * Weekends are only drawn when something is booked on them — a plumber who
 * works Saturdays still needs to see it, but an empty pair of columns would
 * cost a fifth of the width for nothing.
 */

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { Appointment } from '@/types/schema';
import { Card, SecondaryButton, PrimaryButton } from './ui';

interface AppointmentsViewProps {
  appointments: Appointment[];
  onOpenModal: (data?: Partial<Appointment>) => void;
  onCancelAppointment: (id: string) => void;
  /** Jobs can be opened to view, but nothing can be added or changed. */
  readOnly?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monday of the week `offset` weeks from the current one. */
function mondayOf(offset: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  // getDay(): 0 is Sunday, so Sunday belongs to the week that just ended.
  const shift = (date.getDay() + 6) % 7;
  return new Date(date.getTime() + (offset * 7 - shift) * DAY_MS);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const AppointmentsView: React.FC<AppointmentsViewProps> = ({
  appointments,
  onOpenModal,
  onCancelAppointment,
  readOnly = false,
}) => {
  const [weekOffset, setWeekOffset] = useState(0);

  const monday = mondayOf(weekOffset);
  const today = new Date();

  const live = appointments.filter(
    (appointment) => appointment.status !== 'cancelled',
  );

  const dayFor = (index: number) => new Date(monday.getTime() + index * DAY_MS);

  const jobsOn = (date: Date) =>
    live
      .filter((appointment) => {
        if (!appointment.scheduledAtIso) return false;
        const at = new Date(appointment.scheduledAtIso);
        return !Number.isNaN(at.getTime()) && sameDay(at, date);
      })
      .sort((a, b) =>
        (a.scheduledAtIso ?? '').localeCompare(b.scheduledAtIso ?? ''),
      );

  const weekendHasJobs = [5, 6].some((index) => jobsOn(dayFor(index)).length > 0);
  const columnCount = weekendHasJobs ? 7 : 5;
  const columns = Array.from({ length: columnCount }, (_, index) => {
    const date = dayFor(index);
    return { date, jobs: jobsOn(date) };
  });

  const undated = live.filter((appointment) => !appointment.scheduledAtIso);

  const weekLabel = `${monday.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} – ${dayFor(columnCount - 1).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })}`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <SecondaryButton
          onClick={() => setWeekOffset((week) => week - 1)}
          aria-label="Previous week"
          className="w-10 px-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </SecondaryButton>
        <div className="text-[14.5px] font-bold">{weekLabel}</div>
        <SecondaryButton
          onClick={() => setWeekOffset((week) => week + 1)}
          aria-label="Next week"
          className="w-10 px-0"
        >
          <ChevronRight className="h-4 w-4" />
        </SecondaryButton>
        {weekOffset !== 0 && (
          <SecondaryButton onClick={() => setWeekOffset(0)}>
            This week
          </SecondaryButton>
        )}
        {!readOnly && (
          <PrimaryButton className="ml-auto" onClick={() => onOpenModal()}>
            <Plus className="h-4 w-4" />
            New job
          </PrimaryButton>
        )}
      </div>

      <Card className="overflow-hidden">
        <div
          className="grid border-b border-[#E4E8F0]"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))` }}
        >
          {columns.map(({ date }, index) => (
            <div
              key={date.toISOString()}
              className={`px-3 py-3.5 ${
                index === columnCount - 1 ? '' : 'border-r border-[#E4E8F0]'
              } ${sameDay(date, today) ? 'bg-[#F6F8FE]' : 'bg-white'}`}
            >
              <div className="text-[11.5px] font-bold tracking-[.06em] text-[#8A93A6] uppercase">
                {date.toLocaleDateString([], { weekday: 'short' })}
              </div>
              <div
                className={`mt-[3px] text-[17px] font-extrabold ${
                  sameDay(date, today) ? 'text-[#2F6BFF]' : 'text-[#0E1526]'
                }`}
              >
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>

        <div
          className="grid min-h-[340px]"
          style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))` }}
        >
          {columns.map(({ date, jobs }, index) => (
            <div
              key={date.toISOString()}
              className={`flex flex-col gap-2.5 p-3 ${
                index === columnCount - 1 ? '' : 'border-r border-[#E4E8F0]'
              }`}
            >
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => onOpenModal(job)}
                  className={`rounded-[9px] border-l-[3px] px-[11px] py-2.5 text-left transition hover:brightness-[.97] ${
                    job.isAiCreated
                      ? 'border-l-[#2F6BFF] bg-[#F4F7FF]'
                      : 'border-l-[#0E8A5F] bg-[#EFFAF5]'
                  }`}
                >
                  <div
                    className={`text-[11.5px] font-bold ${
                      job.isAiCreated ? 'text-[#2F6BFF]' : 'text-[#0E8A5F]'
                    }`}
                  >
                    {job.scheduledAtIso
                      ? new Date(job.scheduledAtIso).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                  </div>
                  <div className="mt-[3px] truncate text-[12.5px] font-bold">
                    {job.customerName}
                  </div>
                  <div className="mt-0.5 truncate text-[11.5px] text-[#6B7488]">
                    {job.service}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-[18px] text-[12.5px] text-[#6B7488]">
        <div className="flex items-center gap-[7px]">
          <span className="block h-[9px] w-[9px] rounded-[3px] bg-[#2F6BFF]" />
          Booked by AI
        </div>
        <div className="flex items-center gap-[7px]">
          <span className="block h-[9px] w-[9px] rounded-[3px] bg-[#0E8A5F]" />
          Booked by your team
        </div>
        <span className="text-[#8A93A6]">
          {readOnly
            ? 'Select a job to see its details.'
            : 'Select a job to edit or cancel it.'}
        </span>
      </div>

      {undated.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#E4E8F0] px-[22px] py-[18px] text-[14.5px] font-bold">
            Waiting for a time
          </div>
          {undated.map((job, index) => (
            <div
              key={job.id}
              className={`flex items-center gap-4 px-[22px] py-3.5 ${
                index === undated.length - 1 ? '' : 'border-b border-[#E4E8F0]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-bold">
                  {job.customerName}
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-[#6B7488]">
                  {job.service} · {job.customerPhone}
                </div>
              </div>
              {readOnly ? (
                <SecondaryButton onClick={() => onOpenModal(job)}>
                  View
                </SecondaryButton>
              ) : (
                <>
                  <SecondaryButton onClick={() => onOpenModal(job)}>
                    Set a time
                  </SecondaryButton>
                  <SecondaryButton onClick={() => onCancelAppointment(job.id)}>
                    Cancel
                  </SecondaryButton>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </>
  );
};
