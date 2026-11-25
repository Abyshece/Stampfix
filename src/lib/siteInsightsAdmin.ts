// Admin > Website insights: the numbers behind the tab (see the
// 20261130000000_site_insights migration for how each one is counted).

import { supabase } from './supabase';

export type Device = 'mobile' | 'tablet' | 'desktop';
export type Summary = {
  sessions: number; visitors: number; new_visitors: number; returning_visitors: number; new_sessions: number;
  engaged_sessions: number; pageviews: number; actions: number; engaged_ms: number; duration_ms: number; conversions: number;
};
export type PageRow = {
  path: string; views: number; sessions: number; avg_engaged_ms: number; avg_visible_ms: number;
  s25: number; s50: number; s75: number; s100: number; actions: number; entrances: number; bounces: number; exits: number;
};
export type SiteInsights = {
  tz: string;
  summary: Summary;
  previous: Summary;
  daily: { d: string; sessions: number; engaged: number; visitors: number; pageviews: number }[];
  pages: PageRow[];
  sources: { source: string; sessions: number; engaged: number; engaged_ms: number; conversions: number }[];
  referrers: { host: string; sessions: number }[];
  campaigns: { source: string | null; medium: string | null; campaign: string | null; sessions: number; engaged: number; conversions: number }[];
  devices: Partial<Record<Device, number>>;
  dwell: { search_sessions: number; one_page: number; avg_visible_ms: number | null; pages: { path: string; sessions: number; avg_visible_ms: number }[] };
  ctas: { path: string; label: string; href: string | null; clicks: number; views_clicked: number; views: number }[];
  videos: { label: string; path: string; views: number; plays: number; p25: number; p50: number; p75: number; p100: number }[];
  forms: { form: string; path: string; views: number; started: number; submitted: number; completed: number; avg_ms: number | null }[];
  friction: { rage_sessions: number; dead_sessions: number; rage: number; dead: number; top: { kind: 'rage' | 'dead'; path: string; target: string; count: number; sessions: number }[] };
};
export type HeatClick = { k: 'click' | 'rage' | 'dead'; sel: string | null; rx: number | null; ry: number | null; fx: number | null; fy: number | null; i: boolean; l: string | null };
export type Heatmap = {
  views: number;
  clicks: HeatClick[];
  sections: { k: string; h: string | null; seen: number; avg_visible_ms: number; avg_hover_ms: number }[];
};

/** 83 seconds: "1m 23s". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export const browserTimeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

export async function getSiteInsights(from: string, to: string, device: Device | null): Promise<SiteInsights> {
  const { data, error } = await supabase.rpc('admin_site_insights', { p_from: from, p_to: to, p_device: device, p_tz: browserTimeZone() });
  if (error) throw new Error(error.message);
  return data as SiteInsights;
}

export async function getSiteHeatmap(path: string, from: string, to: string, device: Device | null): Promise<Heatmap> {
  const { data, error } = await supabase.rpc('admin_site_heatmap', { p_path: path, p_from: from, p_to: to, p_device: device, p_tz: browserTimeZone() });
  if (error) throw new Error(error.message);
  return data as Heatmap;
}
