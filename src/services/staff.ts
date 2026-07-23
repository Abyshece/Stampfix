import { supabase } from '../lib/supabase';

export interface StaffMember {
  id: string; name: string; active: boolean;
  lastLoginAt: Date | null; createdAt: Date;
}
export interface StaffSession { id: string; name: string; campaignId: string; }

const KEY = 'sf_staff_session';

/** Who is currently at the till (per browser tab). */
export function getStaffSession(campaignId: string): StaffSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StaffSession;
    return s && s.campaignId === campaignId ? s : null;
  } catch { return null; }
}
export function setStaffSession(s: StaffSession) { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }
export function clearStaffSession() { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

interface Row { id: string; name: string; active: boolean; last_login_at: string | null; created_at: string }
const toStaff = (r: Row): StaffMember => ({
  id: r.id, name: r.name, active: r.active,
  lastLoginAt: r.last_login_at ? new Date(r.last_login_at) : null,
  createdAt: new Date(r.created_at),
});

export async function listStaff(campaignId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('staff').select('id,name,active,last_login_at,created_at')
    .eq('campaign_id', campaignId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toStaff);
}

export async function createStaff(campaignId: string, name: string, pin: string): Promise<StaffMember> {
  const { data, error } = await supabase.rpc('staff_create', { p_campaign: campaignId, p_name: name, p_pin: pin });
  if (error) throw error;
  return toStaff((data as Row[])[0]);
}

export async function setStaffPin(staffId: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc('staff_set_pin', { p_staff: staffId, p_pin: pin });
  if (error) throw error;
}

export async function setStaffActive(staffId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('staff').update({ active }).eq('id', staffId);
  if (error) throw error;
}

export async function deleteStaff(staffId: string): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', staffId);
  if (error) throw error;
}

/** Check a PIN. Returns the staff member, or null if it doesn't match. */
export async function verifyStaffPin(campaignId: string, pin: string): Promise<StaffSession | null> {
  const { data, error } = await supabase.rpc('staff_verify_pin', { p_campaign: campaignId, p_pin: pin });
  if (error) throw error;
  const row = (data as { id: string; name: string }[])[0];
  if (!row) return null;
  return { id: row.id, name: row.name, campaignId };
}

export interface StaffLogin { id: string; staffName: string; at: Date; }
export async function listStaffLogins(campaignId: string, limit = 50): Promise<StaffLogin[]> {
  const { data, error } = await supabase
    .from('staff_logins').select('id,created_at,staff:staff_id(name)')
    .eq('campaign_id', campaignId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as unknown as { id: string; created_at: string; staff: { name: string } | null }[])
    .map((r) => ({ id: r.id, staffName: r.staff?.name ?? 'Unknown', at: new Date(r.created_at) }));
}
