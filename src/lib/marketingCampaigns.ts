import { supabase } from './supabase';

// Marketing campaigns (dashboard "Campaigns"). A manual campaign goes out once
// to a customer segment, now or at a scheduled time; an automation messages
// each customer once when they meet a trigger during its active window.
// Sending runs server-side (run_marketing_campaigns via pg_cron) and reaches
// customers through their Apple Wallet pass as a lock-screen notification.

export type CampaignKind = 'manual' | 'automation';
export type CampaignStatus = 'scheduled' | 'sent' | 'active' | 'paused' | 'ended' | 'cancelled';

export const SEGMENTS = ['all', 'new', 'active', 'inactive_30', 'inactive_60', 'close', 'reward_ready', 'loyal'] as const;
export type Segment = (typeof SEGMENTS)[number];

export type TriggerType = 'inactive' | 'stamps_reached' | 'stamps_away' | 'reward_ready' | 'rewards_redeemed' | 'joined_days';

export interface TriggerDef {
  type: TriggerType;
  /** What the trigger's number means; null = no number to pick. */
  unit: 'days' | 'count' | null;
  options: number[];
  defaultValue: number | null;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const TRIGGERS: TriggerDef[] = [
  { type: 'inactive', unit: 'days', options: [14, 30, 60, 90], defaultValue: 30 },
  { type: 'stamps_reached', unit: 'count', options: range(1, 20), defaultValue: 5 },
  { type: 'stamps_away', unit: 'count', options: range(1, 5), defaultValue: 1 },
  { type: 'reward_ready', unit: null, options: [], defaultValue: null },
  { type: 'rewards_redeemed', unit: 'count', options: range(1, 10), defaultValue: 2 },
  { type: 'joined_days', unit: 'days', options: [1, 3, 7, 14, 30], defaultValue: 7 },
];

export const MAX_MESSAGE = 100;
export const MAX_CAMPAIGN_DAYS = 30;

export interface MarketingCampaign {
  id: string;
  kind: CampaignKind;
  name: string;
  message: string;
  locationIds: string[];
  segment: Segment | null;
  triggerType: TriggerType | null;
  triggerValue: number | null;
  timezone: string;
  startsAt: string;
  endsAt: string | null;
  status: CampaignStatus;
  sentCount: number;
  createdAt: string;
}

interface Row {
  id: string; kind: CampaignKind; name: string; message: string; location_ids: string[] | null;
  segment: Segment | null; trigger_type: TriggerType | null; trigger_value: number | null; timezone: string;
  starts_at: string; ends_at: string | null; status: CampaignStatus; sent_count: number | null; created_at: string;
}

const fromRow = (r: Row): MarketingCampaign => ({
  id: r.id, kind: r.kind, name: r.name, message: r.message, locationIds: r.location_ids ?? [],
  segment: r.segment, triggerType: r.trigger_type, triggerValue: r.trigger_value, timezone: r.timezone,
  startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, sentCount: r.sent_count ?? 0, createdAt: r.created_at,
});

export async function listMarketingCampaigns(campaignId: string): Promise<MarketingCampaign[]> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('id, kind, name, message, location_ids, segment, trigger_type, trigger_value, timezone, starts_at, ends_at, status, sent_count, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return ((data as Row[] | null) ?? []).map(fromRow);
}

export interface NewCampaignInput {
  campaignId: string;
  kind: CampaignKind;
  name: string;
  message: string;
  locationIds: string[];
  segment?: Segment;
  triggerType?: TriggerType;
  triggerValue?: number | null;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
}

export async function createMarketingCampaign(input: NewCampaignInput): Promise<MarketingCampaign> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .insert({
      campaign_id: input.campaignId,
      kind: input.kind,
      name: input.name.trim(),
      message: input.message.trim(),
      location_ids: input.locationIds.length ? input.locationIds : null,
      segment: input.kind === 'manual' ? input.segment ?? 'all' : null,
      trigger_type: input.kind === 'automation' ? input.triggerType : null,
      trigger_value: input.kind === 'automation' ? input.triggerValue ?? null : null,
      timezone: input.timezone,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      status: input.kind === 'manual' ? 'scheduled' : 'active',
    })
    .select('id, kind, name, message, location_ids, segment, trigger_type, trigger_value, timezone, starts_at, ends_at, status, sent_count, created_at')
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

/** Runs the campaign right away if it is due (send now / start now). Returns how many customers were messaged. */
export async function launchMarketingCampaign(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('launch_marketing_campaign', { p_id: id });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function setMarketingCampaignStatus(id: string, status: CampaignStatus): Promise<void> {
  const { error } = await supabase.from('marketing_campaigns').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function deleteMarketingCampaign(id: string): Promise<void> {
  const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
  if (error) throw error;
}

/** Customers a manual campaign would reach, or who match an automation's trigger right now. */
export async function estimateReach(p: {
  campaignId: string; kind: CampaignKind; segment?: Segment; triggerType?: TriggerType | null;
  triggerValue?: number | null; locationIds: string[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('marketing_estimate', {
    p_campaign_id: p.campaignId,
    p_kind: p.kind,
    p_segment: p.segment ?? null,
    p_trigger: p.triggerType ?? null,
    p_value: p.triggerValue ?? null,
    p_location_ids: p.locationIds.length ? p.locationIds : null,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

// ---- Time zones ------------------------------------------------------------
// Campaign times are picked as a wall-clock date + time in a chosen IANA time
// zone and stored as UTC instants.

export const browserTimeZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'; } catch { return 'Europe/Berlin'; }
};

const FALLBACK_ZONES = [
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Europe/Madrid', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Vienna',
  'Europe/Zurich', 'Europe/Stockholm', 'Europe/Warsaw', 'Europe/Athens', 'Europe/Istanbul', 'America/New_York',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Vancouver', 'America/Toronto', 'Asia/Dubai',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

/** Offset of `timeZone` from UTC at `at`, in minutes. */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

export function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `GMT${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

export function timeZoneOptions(now = new Date()): { value: string; label: string }[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone');
    if (all && all.length) zones = all;
  } catch { /* older browsers: fallback list */ }
  const own = browserTimeZone();
  if (!zones.includes(own)) zones = [own, ...zones];
  return zones
    .map((z) => {
      let off = 0;
      try { off = zoneOffsetMinutes(z, now); } catch { /* unknown zone */ }
      return { value: z, off, label: `(${offsetLabel(off)}) ${z.replace(/_/g, ' ')}` };
    })
    .sort((a, b) => a.off - b.off || a.value.localeCompare(b.value))
    .map(({ value, label }) => ({ value, label }));
}

/** Converts a wall-clock date ('YYYY-MM-DD') and time ('HH:mm') in `timeZone` to the UTC instant. */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  let ts = wall - zoneOffsetMinutes(timeZone, new Date(wall)) * 60000;
  // Re-check at the result so a DST change between the two guesses is honoured.
  ts = wall - zoneOffsetMinutes(timeZone, new Date(ts)) * 60000;
  return new Date(ts);
}

/** Current wall-clock date and time in `timeZone`. */
export function nowInZone(timeZone: string, at = new Date()): { date: string; time: string } {
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(timeZone, at) * 60000);
  const iso = shifted.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Every half hour of the day, 'HH:mm'. */
export const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function formatInZone(iso: string, timeZone: string, locale?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString(locale);
  }
}
