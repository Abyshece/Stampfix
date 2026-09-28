import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchAuditLog, type AuditRow } from '../services/admin';

const STATUS_WORDS: Record<string, string> = {
  active: 'Reactivated the account',
  frozen: 'Froze stamping',
  blocked: 'Blocked the account',
  deleted: 'Deleted the account',
};

/** One admin action as a short sentence. */
export function describeAuditAction(r: AuditRow): string {
  const d = (r.detail ?? {}) as Record<string, unknown>;
  const s = (k: string) => (d[k] === null || d[k] === undefined ? '' : String(d[k]));
  switch (r.action) {
    case 'merchant.status':
      if (s('from') === 'deleted') return 'Brought back a deleted account';
      return STATUS_WORDS[s('to')] ?? `Status ${s('from')} → ${s('to')}`;
    case 'merchant.plan': return `Plan ${s('from') || '?'} → ${s('to')}`;
    case 'merchant.notes': return 'Updated admin notes';
    case 'merchant.approval':
      if (s('to') === 'approved') return 'Approved the account';
      if (s('to') === 'rejected') return `Rejected the account${s('reason') ? `: “${s('reason')}”` : ''}`;
      return 'Set approval back to pending';
    case 'customer.edit': {
      const fields = ['name', 'email', 'phone'].filter((k) => d[k]);
      return `Edited the customer${fields.length ? ` (${fields.join(', ')})` : ''}`;
    }
    case 'customer.freeze': return 'Froze the customer';
    case 'customer.unfreeze': return 'Unfroze the customer';
    case 'customer.delete': return 'Deleted the customer';
    case 'customer.reset_code': return 'Reset the recovery code';
    case 'ticket.status': return `Ticket → ${s('to').replace('_', ' ')}`;
    case 'contact.status': return `Inquiry marked ${s('to')}`;
    case 'banner.create': return 'Created a promo banner';
    case 'banner.update': return d.active === undefined ? 'Edited a promo banner' : (d.active ? 'Switched a promo banner on' : 'Switched a promo banner off');
    case 'banner.delete': return 'Deleted a promo banner';
    case 'merchant_banner.create': return 'Created a merchant dashboard banner';
    case 'merchant_banner.update': return d.active === undefined ? 'Edited a merchant dashboard banner' : (d.active ? 'Switched a merchant dashboard banner on' : 'Switched a merchant dashboard banner off');
    case 'merchant_banner.delete': return 'Deleted a merchant dashboard banner';
    case 'blog.publish': return 'Published a blog post';
    case 'blog.unpublish': return 'Unpublished a blog post';
    case 'blog.draft': return 'Saved a blog draft';
    case 'blog.edit': return 'Edited a blog post';
    case 'blog.delete': return 'Deleted a blog post';
    case 'notification.send': return `Sent a notification to ${s('to') || 'merchants'}`;
    case 'notification.delete': return 'Deleted a notification';
    case 'digest.settings': return 'Changed the email digest settings';
    default: return r.action;
  }
}

function who(email: string | null): string {
  return email ? email.split('@')[0] : '—';
}

/** The log of changes admins made. With targetId, only actions on that
 *  merchant / customer (compact list for a detail panel). */
export function AdminAuditLog({ targetId, compact = false }: { targetId?: string; compact?: boolean }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null); setErr(null);
    fetchAuditLog(compact ? 30 : 300, targetId ?? null)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setErr(e instanceof Error ? e.message : 'Could not load the admin log'); });
    return () => { live = false; };
  }, [targetId, compact]);

  if (err) return <div className="text-xs text-red-600">{err}</div>;
  if (!rows) {
    return <div className="flex items-center gap-2 text-gray-400 text-xs py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</div>;
  }
  if (compact) {
    if (rows.length === 0) return <div className="text-xs text-gray-400 italic">No admin changes recorded yet.</div>;
    return (
      <ul className="space-y-1.5 max-h-56 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id} className="flex items-start justify-between gap-3 text-xs border-b notion-border pb-1.5 last:border-0">
            <span className="text-[#37352F]">{describeAuditAction(r)} <span className="text-gray-400">· {who(r.admin_email)}</span></span>
            <span className="text-gray-400 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="border notion-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-[#F7F7F5] text-gray-500 text-left text-xs uppercase tracking-wider">
          <tr><th className="px-3 py-2">Time</th><th className="px-3 py-2">Admin</th><th className="px-3 py-2">What</th><th className="px-3 py-2">On</th></tr>
        </thead>
        <tbody className="divide-y notion-border">
          {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No admin changes recorded yet. Every change made from this panel shows up here.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-[#FBFBFA]">
              <td className="px-3 py-2 whitespace-nowrap text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-3 py-2 text-gray-600" title={r.admin_email ?? ''}>{who(r.admin_email)}</td>
              <td className="px-3 py-2">{describeAuditAction(r)}</td>
              <td className="px-3 py-2 text-gray-600">{r.target_label ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
