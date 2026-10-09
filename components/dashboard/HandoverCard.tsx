'use client';

/**
 * Call handover: when the receptionist transfers a caller to a person, and
 * which numbers it rings. Whether a transfer is allowed is decided on the
 * server at call time, from exactly these settings.
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiHandover, ApiHandoverWindow } from '@/lib/api-types';
import { formatE164 } from '@/lib/billing';
import { toE164 } from '@/lib/mappers';
import {
  Card,
  CardTitle,
  FIELD,
  LABEL,
  MUTED,
  Notice,
  PrimaryButton,
  Tag,
  Toggle,
} from './ui';

const WINDOWS: { id: ApiHandoverWindow; label: string }[] = [
  { id: 'ALWAYS', label: 'Any time' },
  { id: 'BUSINESS_HOURS', label: 'During business hours only' },
  { id: 'AFTER_HOURS', label: 'After hours only' },
];

interface Form {
  enabled: boolean;
  primary: string;
  backup: string;
  onRequest: boolean;
  whenUnsure: boolean;
  window: ApiHandoverWindow;
  timeZone: string;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

function allTimeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    // Older browsers: the saved and detected zones are still offered.
  }
  return Array.from(new Set([current, ...zones]));
}

function toForm(settings: ApiHandover): Form {
  return {
    enabled: settings.enabled,
    primary: settings.primaryNumber ? formatE164(settings.primaryNumber) : '',
    backup: settings.backupNumber ? formatE164(settings.backupNumber) : '',
    onRequest: settings.onRequest,
    whenUnsure: settings.whenUnsure,
    window: settings.window,
    timeZone: settings.timeZone ?? browserTimeZone(),
  };
}

export const HandoverCard: React.FC = () => {
  const [settings, setSettings] = useState<ApiHandover | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .handover()
      .then((loaded) => {
        if (!active) return;
        setSettings(loaded);
        setForm(toForm(loaded));
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not load call handover.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (loadError) {
    return (
      <Card className="p-[22px]">
        <CardTitle title="Call handover" className="mb-3" />
        <Notice tone="red">{loadError}</Notice>
      </Card>
    );
  }
  if (!settings || !form) {
    return (
      <Card className="flex items-center gap-2 p-[22px] text-[13px] text-[#6B7488]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading call handover…
      </Card>
    );
  }

  const patch = (changes: Partial<Form>) =>
    setForm((current) => (current ? { ...current, ...changes } : current));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);

    const primary = toE164(form.primary);
    const backup = toE164(form.backup);
    if (form.enabled && !primary) {
      setSaveError('Add the number calls should be transferred to.');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await api.updateHandover({
        enabled: form.enabled,
        ...(primary ? { primaryNumber: primary } : {}),
        backupNumber: backup ?? null,
        onRequest: form.onRequest,
        whenUnsure: form.whenUnsure,
        window: form.window,
        timeZone: form.timeZone,
      });
      setSettings(saved);
      setForm(toForm(saved));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 3000);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not save call handover.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const restricted = form.window !== 'ALWAYS';

  return (
    <Card className="p-[22px]">
      <CardTitle
        title="Call handover"
        action={
          settings.enabled ? (
            <Tag tone="green">On</Tag>
          ) : (
            <Tag tone="grey">Off</Tag>
          )
        }
        className="mb-1.5"
      />
      <p className={`m-0 mb-4 text-[12.5px] ${MUTED}`}>
        Your receptionist tells the caller it is connecting them, then
        transfers the call. If nobody picks up, it rings the backup number,
        and if that fails too it takes a message for a callback.
      </p>

      <form onSubmit={(event) => void save(event)} className="flex flex-col gap-[18px]">
        {saveError && (
          <Notice tone="red" onDismiss={() => setSaveError(null)}>
            {saveError}
          </Notice>
        )}
        {justSaved && (
          <div className="animate-fadeIn flex items-center gap-2 rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[13px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Call handover saved.
          </div>
        )}

        <div className="flex items-center justify-between gap-3.5">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">
              Transfer calls to a person
            </div>
            <div className="mt-0.5 text-xs text-[#8A93A6]">
              When this is off, callers who need a person get a callback.
            </div>
          </div>
          <Toggle
            label="Transfer calls to a person"
            checked={form.enabled}
            onChange={(enabled) => patch({ enabled })}
          />
        </div>

        <div className="grid gap-[15px] sm:grid-cols-2">
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>Handover number</span>
            <input
              type="tel"
              value={form.primary}
              onChange={(event) => patch({ primary: event.target.value })}
              placeholder="(512) 555-0100"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>
              Backup number <span className="font-normal text-[#8A93A6]">(optional)</span>
            </span>
            <input
              type="tel"
              value={form.backup}
              onChange={(event) => patch({ backup: event.target.value })}
              placeholder="Rung if nobody answers"
              className={FIELD}
            />
          </label>
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className={`${LABEL} mb-2`}>When to transfer</legend>
          {(
            [
              {
                key: 'onRequest',
                label: 'The caller asks to speak to a person',
              },
              {
                key: 'whenUnsure',
                label: 'Your receptionist can’t confidently handle the call',
              },
            ] as const
          ).map((row) => (
            <label
              key={row.key}
              className="flex items-center gap-2.5 text-[13.5px] text-[#26304A]"
            >
              <input
                type="checkbox"
                checked={form[row.key]}
                onChange={(event) => patch({ [row.key]: event.target.checked })}
                className="h-4 w-4 accent-[#2F6BFF]"
              />
              {row.label}
            </label>
          ))}
        </fieldset>

        <div className="grid gap-[15px] sm:grid-cols-2">
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>Transfers allowed</span>
            <select
              value={form.window}
              onChange={(event) =>
                patch({ window: event.target.value as ApiHandoverWindow })
              }
              className={FIELD}
            >
              {WINDOWS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[7px]">
            <span className={LABEL}>Your time zone</span>
            <select
              value={form.timeZone}
              onChange={(event) => patch({ timeZone: event.target.value })}
              className={FIELD}
            >
              {allTimeZones(form.timeZone).map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>

        {restricted && !settings.hoursSet && (
          <Notice tone="amber" title="Set your weekly hours first">
            Business hours come from the hours in Company profile. Until they
            are set day by day, calls will not be transferred under this
            option.
          </Notice>
        )}

        <PrimaryButton type="submit" disabled={isSaving} className="self-start">
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save call handover
        </PrimaryButton>
      </form>
    </Card>
  );
};
