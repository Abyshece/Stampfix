import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mail, Search, Loader2, Send, AlertTriangle, ChevronDown, ChevronRight, RotateCcw, Eye, Settings2 } from 'lucide-react';
import { listMerchants, type MerchantRow } from '../services/admin';
import { useToast } from './ToastProvider';
import { Dialog, Switch, inputCls, btnDark, btnLight } from './addonsUi';
import { Pill, flag } from './outreach/common';
import {
  SHOP_EMAIL_TEMPLATES, SHOP_EMAIL_FOOTER, autoFields, fillFields, unfilledFields, shopFooter, withShopFooter, langForCountry, fieldLabel, templateWarning,
  getShopInfo, listSentEmails, setShopOptOut, sendShopEmail, shopEmailError, SendError, getShopEmailFooter, saveShopEmailFooter,
  type EmailLang, type ShopInfo, type SentEmail, type SavedFooters,
} from '../lib/shopEmails';

const FROM = 'Abhishek from Stampfix <hello@stampfix.app>';
const AUTO_KEYS = new Set(['business', 'customers']);
const TPL_BY_ID = new Map(SHOP_EMAIL_TEMPLATES.map((t) => [t.id, t]));

function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Section({ n, title, right, children }: { n: number; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-white border notion-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#37352F]">
          <span className="w-5 h-5 rounded-full bg-[#37352F] text-white text-[11px] flex items-center justify-center">{n}</span>{title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * Admin > Email shops. Write to a shop owner from hello@stampfix.app: pick
 * the shop (the address comes from its account), start from a template,
 * check the preview, send. Every email is logged under Sent emails.
 */
export function ShopEmailsAdmin({ readOnly }: { readOnly: boolean }) {
  const toast = useRef(useToast()).current;
  const [shop, setShop] = useState<MerchantRow | null>(null);
  const [info, setInfo] = useState<ShopInfo | null>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);
  const [tplId, setTplId] = useState<string | null>(null);
  const [lang, setLang] = useState<EmailLang>('en');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  // A template (or language) change that would replace the admin's own text.
  const [pending, setPending] = useState<{ id: string; lang: EmailLang; langSwitch: boolean } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  // The footer saved under "Email footer" (null = the built-in one). The send function reads the same saved footer.
  const [footers, setFooters] = useState<SavedFooters | null>(null);
  useEffect(() => { getShopEmailFooter().then(setFooters).catch(() => setFooters({ en: null, de: null })); }, []);
  // The last send whose outcome we don't know: a retry of the same text reuses its key.
  const lastAttempt = useRef<{ key: string; sig: string } | null>(null);

  const tpl = tplId ? TPL_BY_ID.get(tplId) ?? null : null;

  const loadInfo = useCallback((id: string) => {
    setInfo(null); setInfoErr(null);
    getShopInfo(id).then(setInfo).catch((e) => setInfoErr(shopEmailError(e)));
  }, []);

  const apply = (id: string, l: EmailLang) => {
    const t = TPL_BY_ID.get(id);
    if (!t) return;
    setTplId(id); setLang(l); setSubject(t[l].subject); setBody(t[l].body); setDirty(false); setSendErr(null);
  };
  /** Starts from a template, asking first if that would replace the admin's own text. */
  const hasOwnText = dirty && !!(subject.trim() || body.trim());
  const choose = (id: string, l: EmailLang) => {
    if (hasOwnText) setPending({ id, lang: l, langSwitch: false });
    else apply(id, l);
  };
  /** The language of the template and of the footer. */
  const switchLang = (l: EmailLang) => {
    if (l === lang) return;
    if (!tplId || tplId === 'blank') setLang(l);
    else if (hasOwnText) setPending({ id: tplId, lang: l, langSwitch: true });
    else apply(tplId, l);
  };

  const pickShop = (m: MerchantRow | null) => {
    setShop(m); setSendErr(null);
    if (!m) { setInfo(null); return; }
    loadInfo(m.id);
    const l = langForCountry(m.country);
    // Re-language an untouched template; never rewrite the admin's own text.
    if (l !== lang && !dirty) { if (tplId) apply(tplId, l); else setLang(l); }
  };

  // ---- What goes out -----------------------------------------------------------
  const auto = shop ? autoFields(shop, lang) : {};
  const all = { ...auto, ...values };
  const outSubject = fillFields(subject, all).replace(/[\r\n]+/g, ' ').trim();
  const outBody = fillFields(body, all).trim();
  const askFields = unfilledFields(`${subject}\n${body}`).filter((k) => !AUTO_KEYS.has(k));
  const missing = unfilledFields(`${outSubject}\n${outBody}`);
  const blockedMarketing = !!info?.opted_out && tpl?.kind === 'marketing';
  const shopLang = shop ? langForCountry(shop.country) : null;
  const warning = shop && tplId ? templateWarning(tplId, shop) : null;
  const recent = info?.last && Date.now() - new Date(info.last.created_at).getTime() < 7 * 86_400_000 ? info.last : null;

  const reason: string | null =
    readOnly ? 'View only: you can’t send emails.'
      : !shop ? 'Pick a shop first.'
        : infoErr ? infoErr
          : !info ? 'Loading the shop…'
            : !info.to ? 'This shop has no email address on its account.'
              : blockedMarketing ? 'This shop asked for no marketing emails. Pick a service email or turn off “No marketing emails”.'
                : !outSubject ? 'Write a subject.'
                  : outSubject.length > 200 ? 'The subject is too long (200 characters at most).'
                    : !outBody ? 'Write the email.'
                      : outBody.length > 9000 ? 'The email is too long.'
                        : missing.length ? `Fill in: ${missing.join(', ')}`
                          : null;

  const send = async () => {
    if (!shop || reason) return;
    const sig = JSON.stringify([shop.id, lang, outSubject, outBody]);
    const key = lastAttempt.current?.sig === sig ? lastAttempt.current.key : crypto.randomUUID();
    setSending(true); setSendErr(null);
    try {
      const r = await sendShopEmail({ merchantId: shop.id, template: tplId ?? 'blank', lang, subject: outSubject, body: outBody, key });
      lastAttempt.current = null;
      toast.success(`Sent to ${r.to}`);
      setConfirm(false);
      setTplId(null); setSubject(''); setBody(''); setValues({}); setDirty(false);
      loadInfo(shop.id);
    } catch (e) {
      lastAttempt.current = e instanceof SendError && e.unknownOutcome ? { key, sig } : null;
      setSendErr(shopEmailError(e));
      setConfirm(false);
    } finally {
      setSending(false);
      setHistoryTick((n) => n + 1);
    }
  };

  const toggleOptOut = async () => {
    if (!shop || !info) return;
    const next = !info.opted_out;
    try {
      await setShopOptOut(shop.id, next);
      setInfo({ ...info, opted_out: next });
      toast.success(next ? 'Marked: no marketing emails' : 'Marketing emails allowed again');
    } catch (e) { toast.error(shopEmailError(e)); }
  };

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2"><Mail className="w-5 h-5 text-[#37352F]" /><h1 className="text-2xl font-semibold text-[#37352F]">Email shops</h1></div>
        <p className="text-gray-500 mt-1 text-sm">Write to a shop owner from hello@stampfix.app. Their replies come to hello@stampfix.app.</p>
      </header>
      {readOnly && <p className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2">View only: you can read sent emails, but not send.</p>}

      <div className="grid lg:grid-cols-5 gap-5 items-start">
        <div className="lg:col-span-3 space-y-5 min-w-0">
          <Section n={1} title="Shop">
            {shop
              ? <ShopCard shop={shop} info={info} infoErr={infoErr} readOnly={readOnly} onChange={() => pickShop(null)} onToggleOptOut={toggleOptOut} />
              : <ShopPicker onPick={pickShop} />}
          </Section>

          <Section n={2} title="Template">
            <div className="grid sm:grid-cols-2 gap-2">
              {SHOP_EMAIL_TEMPLATES.map((t) => {
                const off = !!info?.opted_out && t.kind === 'marketing';
                return (
                  <button key={t.id} type="button" data-template={t.id} disabled={readOnly || off} onClick={() => choose(t.id, lang)}
                    title={off ? 'This shop asked for no marketing emails' : t.when}
                    className={`text-left rounded-lg border px-3 py-2.5 transition disabled:opacity-40 ${tplId === t.id ? 'border-[#37352F] ring-2 ring-[#37352F]/10 bg-[#F7F7F5]' : 'notion-border hover:bg-[#F7F7F5]'}`}>
                    <div className="flex items-center gap-2 text-sm font-medium text-[#37352F]">
                      <span aria-hidden>{t.icon}</span><span className="min-w-0 break-words">{t.title}</span>
                      {t.kind === 'marketing' && <span className="ml-auto text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">Marketing</span>}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{t.when}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section n={3} title="Write" right={
            <div className="inline-flex rounded-lg border notion-border overflow-hidden text-xs" role="group" aria-label="Language">
              {(['en', 'de'] as const).map((l) => (
                <button key={l} type="button" disabled={readOnly} onClick={() => switchLang(l)} aria-pressed={lang === l}
                  className={`px-2.5 py-1.5 font-medium ${lang === l ? 'bg-[#37352F] text-white' : 'bg-white text-gray-600 hover:bg-[#F7F7F5]'}`}>
                  {l === 'en' ? 'English' : 'Deutsch'}
                </button>
              ))}
            </div>
          }>
            {shopLang && shopLang !== lang && (
              <p className="text-xs bg-blue-50 text-blue-800 rounded-lg px-3 py-2 mb-3">
                This shop is in {shop?.country}. {tplId ? <button type="button" className="underline font-medium" onClick={() => switchLang(shopLang)}>Write it in {shopLang === 'de' ? 'German' : 'English'}</button> : `Usually it gets ${shopLang === 'de' ? 'German' : 'English'}.`}
              </p>
            )}
            <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="se-subject">Subject</label>
            <input id="se-subject" className={inputCls} value={subject} maxLength={200} disabled={readOnly}
              onChange={(e) => { setSubject(e.target.value); setDirty(true); }} placeholder="What the email is about" />
            <label className="block text-xs font-medium text-gray-600 mt-3 mb-1" htmlFor="se-body">Email</label>
            <textarea id="se-body" className={`${inputCls} font-[inherit] leading-relaxed`} rows={14} value={body} maxLength={9000} disabled={readOnly}
              onChange={(e) => { setBody(e.target.value); setDirty(true); }} placeholder="Pick a template above, or write your own." />
            <p className="text-xs text-gray-500 mt-1.5">
              <code className="bg-gray-100 rounded px-1">{'{business}'}</code> and <code className="bg-gray-100 rounded px-1">{'{customers}'}</code> fill in by themselves.
              The email footer (our address and the “reply stop” line, set under Email footer) is added at the bottom.
            </p>
            {askFields.length > 0 && (
              <div className="mt-4 space-y-3 bg-amber-50/60 border border-amber-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-amber-900">Fill in before sending</div>
                {askFields.map((k) => {
                  const f = fieldLabel(k, tpl);
                  const common = { id: `se-f-${k}`, className: inputCls, value: values[k] ?? '', disabled: readOnly,
                    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value })) };
                  return (
                    <div key={k}>
                      <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor={common.id}>{f.label} <code className="text-gray-400">{`{${k}}`}</code></label>
                      {f.long ? <textarea {...common} rows={4} /> : <input {...common} maxLength={300} />}
                      {f.hint && <p className="text-[11px] text-gray-500 mt-1">{f.hint}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <FooterSettings saved={footers} readOnly={readOnly} onSaved={setFooters} />
        </div>

        <div className="lg:col-span-2 lg:sticky lg:top-6 space-y-3 min-w-0">
          <section className="bg-white border notion-border rounded-xl overflow-hidden" aria-label="Preview">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b notion-border text-sm font-semibold text-[#37352F]"><Eye className="w-4 h-4" /> Preview</div>
            <dl className="px-4 py-3 text-xs space-y-1 border-b notion-border">
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500">From</dt><dd className="min-w-0 break-words">{FROM}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500">To</dt><dd className="min-w-0 break-all" data-preview-to>{info?.to ?? <span className="text-gray-400">Pick a shop</span>}</dd></div>
              <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-500">Subject</dt><dd className="min-w-0 break-words font-medium" data-preview-subject>{outSubject || <span className="text-gray-400 font-normal">No subject yet</span>}</dd></div>
            </dl>
            <div className="px-4 py-3 text-sm text-[#37352F] whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto" data-preview-body>
              {outBody ? withShopFooter(outBody, lang, footers?.[lang]) : <span className="text-gray-400">The email shows here.</span>}
            </div>
          </section>

          {recent && (
            <p className="flex gap-2 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Last email to this shop {ago(recent.created_at)}: “{recent.subject}”{recent.status === 'failed' ? ' (failed)' : ''}</span>
            </p>
          )}
          {warning && <p className="flex gap-2 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-lg px-3 py-2"><AlertTriangle className="w-4 h-4 shrink-0" />{warning}</p>}
          {sendErr && <p role="alert" className="text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-2">{sendErr}</p>}

          {!readOnly && (
            <>
              <button type="button" className={`${btnDark} w-full py-2.5`} disabled={!!reason || sending} onClick={() => setConfirm(true)}>
                <Send className="w-4 h-4" /> {lastAttempt.current ? 'Try again' : 'Send'}{info?.to && !reason ? ` to ${info.to}` : ''}
              </button>
              {reason && <p className="text-xs text-gray-500 text-center" data-send-reason>{reason}</p>}
            </>
          )}
        </div>
      </div>

      <SentEmails shop={shop} tick={historyTick} />

      {pending && (
        <Dialog title="Replace your text?" onClose={() => setPending(null)}>
          <p className="px-5 text-sm text-gray-600">
            This replaces the subject and email you wrote with the “{TPL_BY_ID.get(pending.id)?.title}” template in {pending.lang === 'de' ? 'German' : 'English'}.
            {pending.langSwitch && ' If you keep your text, only the address lines at the bottom change language.'}
          </p>
          <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
            <button type="button" className={btnLight} onClick={() => { if (pending.langSwitch) setLang(pending.lang); setPending(null); }}>Keep my text</button>
            <button type="button" className={btnDark} onClick={() => { apply(pending.id, pending.lang); setPending(null); }}>Replace</button>
          </div>
        </Dialog>
      )}
      {confirm && shop && info?.to && (
        <Dialog title="Send this email?" onClose={() => { if (!sending) setConfirm(false); }}>
          <dl className="px-5 text-sm space-y-1.5">
            <div><dt className="text-xs text-gray-500">To</dt><dd className="break-all font-medium">{info.to}</dd></div>
            <div><dt className="text-xs text-gray-500">Shop</dt><dd className="break-words">{shop.business_name || '(no name)'}</dd></div>
            <div><dt className="text-xs text-gray-500">Subject</dt><dd className="break-words">{outSubject}</dd></div>
          </dl>
          <div className="flex justify-end gap-2 px-5 py-4 mt-5 border-t notion-border">
            <button type="button" className={btnLight} disabled={sending} onClick={() => setConfirm(false)}>Cancel</button>
            <button type="button" className={btnDark} disabled={sending} onClick={send} data-confirm-send>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send now
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

// ---- Email footer ----------------------------------------------------------------

/** Edit the lines added under every email, in English and German. Empty = the built-in footer. */
function FooterSettings({ saved, readOnly, onSaved }: { saved: SavedFooters | null; readOnly: boolean; onSaved: (f: SavedFooters) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<EmailLang, string>>({ en: '', de: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (saved) setDraft({ en: shopFooter('en', saved.en), de: shopFooter('de', saved.de) }); }, [saved]);
  const current = (l: EmailLang) => shopFooter(l, saved?.[l]);
  const changed = !!saved && (['en', 'de'] as const).some((l) => draft[l].trim() !== current(l));
  const custom = !!saved && (!!saved.en || !!saved.de);

  const save = async () => {
    setSaving(true); setErr(null);
    // The built-in text is saved as "none", so later fixes to the built-in footer still apply.
    const out = (l: EmailLang) => (draft[l].trim() === SHOP_EMAIL_FOOTER[l] ? '' : draft[l]);
    try { onSaved(await saveShopEmailFooter(out('en'), out('de'))); toast.success('Email footer saved.'); }
    catch (e) { setErr(/too_long/.test(String((e as { message?: string } | null)?.message ?? '')) ? 'Each footer can be up to 1000 characters.' : 'Could not save the footer. Try again.'); }
    finally { setSaving(false); }
  };

  return (
    <section className="bg-white border notion-border rounded-xl" data-footer-settings>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 sm:px-5 py-3.5 text-sm font-semibold text-[#37352F] text-left">
        <Settings2 className="w-4 h-4" /> Email footer
        <span className="text-xs font-normal text-gray-500">{custom ? 'Your own' : 'Built-in'} · English and German</span>
        {open ? <ChevronDown className="w-4 h-4 ml-auto text-gray-400" /> : <ChevronRight className="w-4 h-4 ml-auto text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-4 space-y-3">
          <p className="text-xs text-gray-500">Added under every email you send here. Keep our postal address and a way to say no to these emails (Canada’s anti-spam law, and § 7 UWG for German shops).</p>
          {saved === null ? <Loader2 className="w-4 h-4 animate-spin text-gray-300" /> : (['en', 'de'] as const).map((l) => (
            <div key={l}>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="text-xs font-medium text-gray-600" htmlFor={`se-footer-${l}`}>{l === 'en' ? 'English' : 'Deutsch'}</label>
                {!readOnly && draft[l].trim() !== SHOP_EMAIL_FOOTER[l] && (
                  <button type="button" className="inline-flex items-center gap-1 text-[11px] text-gray-500 underline hover:text-[#37352F]"
                    onClick={() => setDraft((d) => ({ ...d, [l]: SHOP_EMAIL_FOOTER[l] }))}><RotateCcw className="w-3 h-3" /> Use the built-in footer</button>
                )}
              </div>
              <textarea id={`se-footer-${l}`} className={`${inputCls} font-[inherit] leading-relaxed`} rows={3} maxLength={1000} disabled={readOnly}
                value={draft[l]} onChange={(e) => setDraft((d) => ({ ...d, [l]: e.target.value }))} />
            </div>
          ))}
          {err && <p role="alert" className="text-xs text-red-600">{err}</p>}
          {!readOnly && saved !== null && (
            <div className="flex justify-end">
              <button type="button" className={btnDark} disabled={!changed || saving} onClick={save} data-footer-save>
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save footer
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---- Shop ------------------------------------------------------------------------

function ShopPicker({ onPick }: { onPick: (m: MerchantRow) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MerchantRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      listMerchants(q.trim() || undefined, 30)
        .then((r) => { if (alive) { setRows(r.filter((m) => m.status !== 'deleted')); setErr(null); } })
        .catch((e) => { if (alive) setErr(shopEmailError(e)); });
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by shop name, email or code" aria-label="Search shops" />
      </div>
      {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
      {!rows && !err && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-500 mt-3">No shops found.</p>}
      {rows && rows.length > 0 && (
        <ul className="mt-2 max-h-80 overflow-y-auto divide-y notion-border border notion-border rounded-lg">
          {rows.map((m) => (
            <li key={m.id}>
              <button type="button" data-shop-pick={m.id} onClick={() => onPick(m)} className="w-full text-left px-3 py-2.5 hover:bg-[#F7F7F5] flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[#37352F] break-words">{m.business_name || '(no name)'} <span className="text-gray-400 font-normal">{m.country ? `${flag(m.country)} ${m.country}` : ''}</span></div>
                  <div className="text-xs text-gray-500 break-all">{m.email || 'no email'}</div>
                </div>
                <PlanPill m={m} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanPill({ m }: { m: MerchantRow }) {
  if (m.plan === 'pro') return <Pill cls="bg-violet-50 text-violet-700">{m.is_comped ? 'Pro (free)' : 'Pro'}</Pill>;
  return <Pill cls="bg-gray-100 text-gray-600">Free</Pill>;
}

function ShopCard({ shop, info, infoErr, readOnly, onChange, onToggleOptOut }: {
  shop: MerchantRow; info: ShopInfo | null; infoErr: string | null; readOnly: boolean; onChange: () => void; onToggleOptOut: () => void;
}) {
  return (
    <div data-shop-card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-[#37352F] break-words flex items-center gap-2 flex-wrap">
            {shop.business_name || '(no name)'} <PlanPill m={shop} />
            {shop.status !== 'active' && <Pill cls="bg-red-50 text-red-700">{shop.status}</Pill>}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {shop.country ? `${flag(shop.country)} ${shop.country} · ` : ''}{shop.card_count} customers · last login {ago(shop.last_login_at)}
          </div>
        </div>
        <button type="button" className={btnLight} onClick={onChange}><RotateCcw className="w-3.5 h-3.5" /> Change</button>
      </div>
      <div className="mt-3 text-sm flex gap-2 items-baseline">
        <span className="text-xs text-gray-500 w-8 shrink-0">To</span>
        {infoErr ? <span className="text-red-600 text-xs">{infoErr}</span>
          : !info ? <Loader2 className="w-4 h-4 animate-spin text-gray-300" />
            : info.to ? <span className="font-medium break-all" data-shop-to>{info.to}</span>
              : <span className="text-red-600 text-xs">No email address on this account</span>}
      </div>
      {info && (
        <div className="mt-3 pt-3 border-t notion-border flex items-center justify-between gap-3">
          <div className="text-xs text-gray-600">
            <div className="font-medium text-[#37352F]">No marketing emails</div>
            Turn on when they ask us to stop. Service emails still go out.
          </div>
          <Switch on={info.opted_out} onChange={onToggleOptOut} disabled={readOnly} label="No marketing emails" size="sm" />
        </div>
      )}
    </div>
  );
}

// ---- Sent emails ----------------------------------------------------------------

const SENT_STATUS = {
  sent: ['Sent', 'bg-green-50 text-green-700'], failed: ['Failed', 'bg-red-50 text-red-700'], sending: ['Unclear', 'bg-amber-50 text-amber-800'],
} as const;

function SentEmails({ shop, tick }: { shop: MerchantRow | null; tick: number }) {
  const [scope, setScope] = useState<'all' | 'shop'>('all');
  const [rows, setRows] = useState<SentEmail[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const forShop = scope === 'shop' && shop ? shop.id : null;
  useEffect(() => { if (!shop) setScope('all'); }, [shop]);
  useEffect(() => {
    let alive = true;
    listSentEmails(forShop, 100)
      .then((r) => { if (alive) { setRows(r); setErr(null); } })
      .catch((e) => { if (alive) setErr(shopEmailError(e)); });
    return () => { alive = false; };
  }, [forShop, tick]);

  return (
    <section className="bg-white border notion-border rounded-xl" aria-label="Sent emails">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b notion-border flex-wrap">
        <h2 className="text-sm font-semibold text-[#37352F]">Sent emails</h2>
        {shop && (
          <div className="inline-flex rounded-lg border notion-border overflow-hidden text-xs">
            {(['all', 'shop'] as const).map((s) => (
              <button key={s} type="button" onClick={() => setScope(s)} aria-pressed={scope === s}
                className={`px-2.5 py-1.5 font-medium ${scope === s ? 'bg-[#37352F] text-white' : 'bg-white text-gray-600 hover:bg-[#F7F7F5]'}`}>
                {s === 'all' ? 'All shops' : 'This shop'}
              </button>
            ))}
          </div>
        )}
      </div>
      {err && <p className="text-sm text-red-600 px-5 py-4">{err}</p>}
      {!rows && !err && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-300" /></div>}
      {rows && rows.length === 0 && <p className="text-sm text-gray-500 px-5 py-6">No emails sent yet.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y notion-border">
          {rows.map((r) => {
            const [label, cls] = SENT_STATUS[r.status];
            const isOpen = open === r.id;
            return (
              <li key={r.id} data-sent-row={r.subject}>
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} className="w-full text-left px-4 sm:px-5 py-3 hover:bg-[#FBFBFA] flex items-start gap-3" aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[#37352F] break-words">{r.subject}</div>
                    <div className="text-xs text-gray-500 mt-0.5 break-words">
                      {r.business_name || '(no name)'} · <span className="break-all">{r.to_email}</span>
                      {r.template && TPL_BY_ID.get(r.template) ? ` · ${TPL_BY_ID.get(r.template)!.title}` : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Pill cls={cls}>{label}</Pill>
                    <div className="text-[11px] text-gray-400 mt-1 whitespace-nowrap">{when(r.created_at)}</div>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 sm:px-5 pb-4 pl-11 sm:pl-12">
                    {r.error && <p className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5 mb-2 break-words">{r.error}</p>}
                    {r.status === 'sending' && <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1.5 mb-2">We don’t know whether this one went out. Check hello@stampfix.app’s sent mail in Resend before sending it again.</p>}
                    <div className="text-sm whitespace-pre-wrap break-words text-[#37352F] bg-[#FBFBFA] border notion-border rounded-lg p-3">{r.body}</div>
                    {r.sent_by_email && <p className="text-[11px] text-gray-400 mt-1.5">Sent by {r.sent_by_email}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
