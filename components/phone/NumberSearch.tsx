'use client';

/**
 * Search for an available Ringgy (Telnyx) number and pick one. Shared by the
 * signup phone step, where picking only selects the number to buy once the
 * plan is paid, and the dashboard Phone tab, where picking buys it.
 *
 * The filters combine: country and number type, then any of area code,
 * city / region and state / province. A toll-free number is national, so
 * the city and state filters step aside for it; the state filter only
 * appears for countries Telnyx supports it in.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import type { ApiAvailableNumber, ApiNumberSearch } from '@/lib/api-types';
import { formatE164 } from '@/lib/billing';
import { PHONE_COUNTRIES, phoneCountry } from '@/lib/phone-countries';
import { FIELD, LABEL, Notice, SecondaryButton } from '@/components/dashboard/ui';

export interface NumberSearchProps {
  search: (query: ApiNumberSearch) => Promise<ApiAvailableNumber[]>;
  /** Filters to start from, e.g. the area code of the number being forwarded. */
  initial?: Partial<ApiNumberSearch>;
  /** Run the initial search straight away. */
  autoSearch?: boolean;
  /** The picked number, shown as selected (signup). */
  selected?: string | null;
  actionLabel: string;
  /** "$5/mo", "Included in your plan" — or null for no price line. */
  priceLabel: (result: ApiAvailableNumber) => string | null;
  /** Why a result cannot be picked right now, or null when it can. */
  blockedReason?: (result: ApiAvailableNumber) => string | null;
  onPick: (result: ApiAvailableNumber, country: string) => void;
  fieldClassName?: string;
  labelClassName?: string;
  /** How many numbers to show per search. */
  limit?: number;
}

export const NumberSearch: React.FC<NumberSearchProps> = ({
  search,
  initial,
  autoSearch = false,
  selected,
  actionLabel,
  priceLabel,
  blockedReason,
  onPick,
  fieldClassName = FIELD,
  labelClassName = LABEL,
  limit = 12,
}) => {
  const [query, setQuery] = useState<ApiNumberSearch>({
    country: 'US',
    type: 'local',
    ...initial,
  });
  const [results, setResults] = useState<ApiAvailableNumber[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = phoneCountry(query.country);
  const tollFree = query.type === 'toll_free';
  const anyMasked = results?.some((result) => result.masked) ?? false;

  const patch = (changes: Partial<ApiNumberSearch>) =>
    setQuery((current) => ({ ...current, ...changes }));

  const run = async (next: ApiNumberSearch = query) => {
    setIsSearching(true);
    setError(null);
    try {
      setResults(
        await search({
          country: next.country,
          type: next.type,
          areaCode: next.areaCode || undefined,
          contains: next.contains || undefined,
          // Sent only where they can apply, so a stale value typed before
          // switching to toll-free or another country cannot empty the list.
          locality: next.type === 'toll_free' ? undefined : next.locality?.trim() || undefined,
          region:
            next.type === 'toll_free' || !phoneCountry(next.country).region
              ? undefined
              : next.region?.trim().toUpperCase() || undefined,
          limit,
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not search for numbers.');
      setResults(null);
    }
    setIsSearching(false);
  };

  // Once, with the starting filters (e.g. the forwarded number's area code).
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoSearch || autoRan.current) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch]);

  return (
    // Sized by its own width rather than the viewport: the same search sits
    // in the narrow signup column and in a wide dashboard card.
    <div className="@container flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-3 @sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="flex flex-col gap-1.5">
            <span className={labelClassName}>Country</span>
            <select
              value={query.country}
              onChange={(event) => patch({ country: event.target.value, region: '' })}
              className={fieldClassName}
            >
              {PHONE_COUNTRIES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={labelClassName}>Number type</span>
            <div className="flex gap-2">
              {(['local', 'toll_free'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={query.type === type}
                  onClick={() => patch({ type })}
                  className={`h-11 rounded-[10px] border px-4 text-[13px] font-bold transition ${
                    query.type === type
                      ? 'border-[#2F6BFF] bg-[#2F6BFF] text-white'
                      : 'border-[#DDE1EA] bg-white text-[#26304A] hover:border-[#B9C3D8]'
                  }`}
                >
                  {type === 'local' ? 'Local' : 'Toll-free'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-[11.5px] font-bold tracking-[.08em] text-[#8A93A6] uppercase">
          Search by — combine any of these
        </div>
        <div
          className={`grid gap-3 ${
            tollFree
              ? '@sm:grid-cols-2'
              : country.region
                ? '@sm:grid-cols-2 @lg:grid-cols-3'
                : '@sm:grid-cols-2'
          }`}
        >
          <label className="flex flex-col gap-1.5">
            <span className={labelClassName}>{tollFree ? 'Prefix' : 'Area code'}</span>
            <input
              inputMode="numeric"
              maxLength={5}
              value={query.areaCode ?? ''}
              onChange={(event) => patch({ areaCode: event.target.value.replace(/\D/g, '') })}
              placeholder={tollFree ? '888' : country.areaCodePlaceholder}
              className={fieldClassName}
            />
          </label>
          {tollFree ? (
            <label className="flex flex-col gap-1.5">
              <span className={labelClassName}>Contains digits</span>
              <input
                inputMode="numeric"
                value={query.contains ?? ''}
                onChange={(event) => patch({ contains: event.target.value.replace(/\D/g, '') })}
                placeholder="2020"
                className={fieldClassName}
              />
            </label>
          ) : (
            <>
              <label className="flex flex-col gap-1.5">
                <span className={labelClassName}>City / Region</span>
                <input
                  value={query.locality ?? ''}
                  onChange={(event) => patch({ locality: event.target.value })}
                  placeholder={country.cityPlaceholder}
                  className={fieldClassName}
                />
              </label>
              {country.region && (
                <label className="flex flex-col gap-1.5">
                  <span className={labelClassName}>{country.region.label}</span>
                  <input
                    maxLength={3}
                    value={query.region ?? ''}
                    onChange={(event) => patch({ region: event.target.value.toUpperCase() })}
                    placeholder={country.region.placeholder}
                    className={fieldClassName}
                  />
                </label>
              )}
            </>
          )}
        </div>

        <button
          type="submit"
          disabled={isSearching}
          className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-[10px] bg-[#0E1526] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#2F6BFF] disabled:opacity-60"
        >
          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search numbers
        </button>
      </form>

      {error && <Notice tone="amber">{error}</Notice>}

      {anyMasked && (
        <Notice tone="blue" title="Number purchasing is almost ready">
          We can show which numbers are available, but buying them is pending
          verification of our phone carrier account. Check back soon — or
          connect your existing phone system over SIP meanwhile.
        </Notice>
      )}

      {results && results.length === 0 && (
        <p className="m-0 text-[13px] text-[#6B7488]">
          No numbers matched. Try a nearby area code, or remove a filter.
        </p>
      )}

      {results && results.length > 0 && (
        <div className="grid gap-2 @lg:grid-cols-2">
          {results.map((result, index) => {
            const isSelected = selected === result.phoneNumber;
            const blocked = blockedReason?.(result) ?? null;
            const price = priceLabel(result);
            return (
              <div
                key={`${result.phoneNumber}-${index}`}
                className={`flex items-center gap-3 rounded-[12px] border px-3.5 py-3 transition ${
                  isSelected ? 'border-[#2F6BFF] bg-[#F4F7FF]' : 'border-[#E4E8F0] bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[14px] font-bold text-[#0E1526]">
                    {formatE164(result.phoneNumber)}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[#6B7488]">
                    {[
                      [result.locality, result.region].filter(Boolean).join(', ') ||
                        (tollFree ? 'Toll-free' : null),
                      price,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {isSelected ? (
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#2F6BFF]">
                    <Check className="h-4 w-4" /> Selected
                  </span>
                ) : (
                  <SecondaryButton
                    type="button"
                    disabled={Boolean(blocked)}
                    title={blocked ?? undefined}
                    onClick={() => onPick(result, query.country ?? 'US')}
                  >
                    {actionLabel}
                  </SecondaryButton>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
