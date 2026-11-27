import { supabase } from './supabase';
import { SHOP_EMAIL_FOOTER, shopFooter, withShopFooter, unfilledFields, type EmailLang } from '../../supabase/functions/admin-send-email/footer';

export { SHOP_EMAIL_FOOTER, shopFooter, withShopFooter, unfilledFields, type EmailLang };

/** The footers saved in Admin > Email shops (null = the built-in one). */
export type SavedFooters = { en: string | null; de: string | null };

export async function getShopEmailFooter(): Promise<SavedFooters> {
  const { data, error } = await supabase.rpc('admin_shop_email_footer');
  if (error) throw error;
  const d = (data ?? {}) as Partial<SavedFooters>;
  return { en: d.en ?? null, de: d.de ?? null };
}

export async function saveShopEmailFooter(en: string, de: string): Promise<SavedFooters> {
  const { data, error } = await supabase.rpc('admin_set_shop_email_footer', { p_en: en, p_de: de });
  if (error) throw error;
  const d = (data ?? {}) as Partial<SavedFooters>;
  return { en: d.en ?? null, de: d.de ?? null };
}

// Admin > Email shops: write to a shop owner from the admin panel. Templates
// for the usual cases, in English and German (German shops get German).
//
// In a template, {business} and {customers} are filled from the shop's
// account; any other {field} is one the admin fills in before sending
// (e.g. a discount code). Sending is refused while a {field} is left.

export type TemplateKind = 'service' | 'marketing';
export interface TemplateField { key: string; label: string; hint?: string; long?: boolean }
export interface ShopEmailTemplate {
  id: string;
  icon: string;
  title: string;
  when: string;
  /** Service emails go to every shop; marketing ones not to shops that said no. */
  kind: TemplateKind;
  fields: TemplateField[];
  en: { subject: string; body: string };
  de: { subject: string; body: string };
}

const SIGN = 'Abhishek\nStampfix';
const CODE_HINT = 'Make it in Stripe first: Product catalog › Coupons › New, 100% off, duration “Once” (one free month). Then add a customer-facing code to that coupon and type the code here.';

export const SHOP_EMAIL_TEMPLATES: ShopEmailTemplate[] = [
  {
    id: 'pro_ended', icon: '⏰', title: 'Pro has ended', when: 'Their Pro plan ran out or was cancelled.', kind: 'service', fields: [],
    en: {
      subject: 'Your Stampfix Pro plan has ended',
      body: `Hi there,

Your Stampfix Pro plan for {business} has ended, so your account is back on the free plan. The free plan covers your first 5 customers; Pro removes that limit and unlocks branding and multi-location features.

To keep everything running for your regulars, you can renew Pro in a minute: log in at stampfix.app and go to Settings, Account & billing.

If something wasn't working for you, just reply to this email. I read every reply.

${SIGN}`,
    },
    de: {
      subject: 'Ihr Stampfix Pro-Tarif ist abgelaufen',
      body: `Hallo,

Ihr Stampfix Pro-Tarif für {business} ist abgelaufen, Ihr Konto läuft jetzt wieder im kostenlosen Tarif. Der kostenlose Tarif umfasst Ihre ersten 5 Kundinnen und Kunden; Pro hebt diese Grenze auf und schaltet eigenes Branding und mehrere Standorte frei.

Damit für Ihre Stammkundschaft alles weiterläuft, können Sie Pro in einer Minute verlängern: Melden Sie sich auf stampfix.app an und öffnen Sie Einstellungen, Konto & Abrechnung.

Wenn etwas nicht gepasst hat, antworten Sie einfach auf diese E-Mail. Ich lese jede Antwort.

${SIGN}`,
    },
  },
  {
    id: 'inactive_code', icon: '🎁', title: 'Not used lately: free month', when: 'No activity for about 10 days. Includes a code for 1 month of Pro.', kind: 'marketing',
    fields: [{ key: 'code', label: 'Code for 1 month free', hint: CODE_HINT }],
    en: {
      subject: 'A free month of Stampfix Pro for {business}',
      body: `Hi there,

I noticed {business} hasn't used Stampfix in the last 10 days, so I wanted to check in. Is something getting in the way? Reply with what's missing and I'll help you get it set up.

To make it easy to give Stampfix a proper try, here's a code for 1 month of Pro for free: {code}

To use it, log in at stampfix.app, go to Settings, Account & billing, choose Pro and enter the code at checkout.

${SIGN}`,
    },
    de: {
      subject: 'Ein kostenloser Monat Stampfix Pro für {business}',
      body: `Hallo,

mir ist aufgefallen, dass {business} Stampfix in den letzten 10 Tagen nicht genutzt hat, deshalb wollte ich kurz nachfragen. Hakt es irgendwo? Schreiben Sie mir gern, was fehlt, dann helfe ich Ihnen bei der Einrichtung.

Damit Sie Stampfix in Ruhe testen können, hier ein Code für 1 Monat Pro kostenlos: {code}

So lösen Sie ihn ein: Melden Sie sich auf stampfix.app an, öffnen Sie Einstellungen, Konto & Abrechnung, wählen Sie Pro und geben Sie den Code beim Bezahlen ein.

${SIGN}`,
    },
  },
  {
    id: 'welcome', icon: '👋', title: 'Welcome', when: 'A new shop signed up. The three steps to the first stamps.', kind: 'service', fields: [],
    en: {
      subject: 'Welcome to Stampfix, {business}',
      body: `Hi there,

Welcome to Stampfix! I'm Abhishek, the founder. Three steps get {business} its first stamps this week:

1. Add your logo and colours (Settings, Wallet & card).
2. Print your QR poster and put it by the till (Settings, Posters & print).
3. Scan the poster with your own phone once to see what your customers see.

If you get stuck anywhere, just reply to this email and I'll help.

${SIGN}`,
    },
    de: {
      subject: 'Willkommen bei Stampfix, {business}',
      body: `Hallo,

willkommen bei Stampfix! Ich bin Abhishek, der Gründer. Mit drei Schritten bekommt {business} diese Woche die ersten Stempel:

1. Logo und Farben hinzufügen (Einstellungen, Wallet & Karte).
2. Ihr QR-Poster drucken und neben die Kasse stellen (Einstellungen, Poster & Druck).
3. Das Poster einmal mit dem eigenen Handy scannen und sehen, was Ihre Kundschaft sieht.

Wenn Sie irgendwo nicht weiterkommen, antworten Sie einfach auf diese E-Mail, ich helfe gern.

${SIGN}`,
    },
  },
  {
    id: 'setup_incomplete', icon: '🧩', title: 'No customers yet', when: 'Signed up, but nobody has joined the stamp card yet.', kind: 'service', fields: [],
    en: {
      subject: 'Your stamp card is almost ready',
      body: `Hi there,

Your Stampfix account for {business} is set up, but no customer has joined your stamp card yet. Usually just one thing is missing: the QR poster at the counter.

You can print it under Settings, Posters & print. Put it next to the till and ask the next few customers if they'd like a stamp card; it takes them about ten seconds.

Want me to go through your setup with you? Just reply with a good time.

${SIGN}`,
    },
    de: {
      subject: 'Ihre Stempelkarte ist fast startklar',
      body: `Hallo,

Ihr Stampfix-Konto für {business} ist eingerichtet, aber bisher hat sich noch niemand für Ihre Stempelkarte angemeldet. Meist fehlt nur eine Sache: das QR-Poster an der Theke.

Sie können es unter Einstellungen, Poster & Druck ausdrucken. Stellen Sie es neben die Kasse und fragen Sie die nächsten Kundinnen und Kunden, ob sie eine Stempelkarte möchten; das dauert für sie etwa zehn Sekunden.

Soll ich Ihre Einrichtung mit Ihnen durchgehen? Antworten Sie einfach mit einem passenden Termin.

${SIGN}`,
    },
  },
  {
    id: 'free_limit', icon: '📈', title: 'Reached 5 customers', when: 'The free plan is full; new customers can’t join.', kind: 'service', fields: [],
    en: {
      subject: '{business} has reached the free plan’s 5 customers',
      body: `Hi there,

Great news: {customers} customers have joined your stamp card at {business}. That's the limit of the free plan, so new customers can't join until you upgrade.

Pro removes the limit and unlocks branding and multi-location features. You can upgrade in a minute under Settings, Account & billing.

${SIGN}`,
    },
    de: {
      subject: '{business} hat die 5 Kunden des kostenlosen Tarifs erreicht',
      body: `Hallo,

gute Nachrichten: {customers} Kundinnen und Kunden haben sich bei {business} für Ihre Stempelkarte angemeldet. Das ist die Grenze des kostenlosen Tarifs, neue Kundschaft kann sich erst nach einem Upgrade anmelden.

Pro hebt die Grenze auf und schaltet eigenes Branding und mehrere Standorte frei. Das Upgrade dauert eine Minute: Einstellungen, Konto & Abrechnung.

${SIGN}`,
    },
  },
  {
    id: 'payment_failed', icon: '💳', title: 'Payment failed', when: 'Stripe couldn’t charge their card.', kind: 'service', fields: [],
    en: {
      subject: 'Your Stampfix payment didn’t go through',
      body: `Hi there,

Your last payment for Stampfix Pro ({business}) didn't go through. Usually the card has expired or the bank declined it.

Please update your payment method so your stamp card keeps running without a break: log in at stampfix.app, go to Settings, Account & billing, and update your card there.

If you think this is a mistake, just reply and I'll look into it.

${SIGN}`,
    },
    de: {
      subject: 'Ihre Stampfix-Zahlung ist nicht durchgegangen',
      body: `Hallo,

Ihre letzte Zahlung für Stampfix Pro ({business}) ist nicht durchgegangen. Meist ist die Karte abgelaufen oder die Bank hat die Zahlung abgelehnt.

Bitte aktualisieren Sie Ihre Zahlungsmethode, damit Ihre Stempelkarte ohne Unterbrechung weiterläuft: Melden Sie sich auf stampfix.app an, öffnen Sie Einstellungen, Konto & Abrechnung und hinterlegen Sie dort Ihre Karte neu.

Falls das ein Irrtum ist, antworten Sie einfach, dann sehe ich nach.

${SIGN}`,
    },
  },
  {
    id: 'card_live', icon: '✅', title: 'Stamp card approved', when: 'You approved their stamp card.', kind: 'service', fields: [],
    en: {
      subject: 'Your stamp card is live',
      body: `Hi there,

Good news: the stamp card for {business} is approved and live. Customers join by scanning your QR poster, and the card goes straight into Apple Wallet or Google Wallet.

A tip for the first week: ask each customer at the till if they'd like a stamp card. A quick mention makes a big difference.

${SIGN}`,
    },
    de: {
      subject: 'Ihre Stempelkarte ist live',
      body: `Hallo,

gute Nachrichten: Die Stempelkarte für {business} ist freigegeben und live. Ihre Kundschaft meldet sich an, indem sie Ihr QR-Poster scannt, und die Karte landet direkt in Apple Wallet oder Google Wallet.

Ein Tipp für die erste Woche: Fragen Sie an der Kasse jede Kundin und jeden Kunden, ob sie eine Stempelkarte möchten. Ein kurzer Hinweis macht viel aus.

${SIGN}`,
    },
  },
  {
    id: 'card_changes', icon: '✏️', title: 'Stamp card needs a change', when: 'Their stamp card can’t be approved yet.', kind: 'service',
    fields: [{ key: 'reason', label: 'What needs to change', long: true }],
    en: {
      subject: 'One small change before your stamp card goes live',
      body: `Hi there,

Thanks for setting up your stamp card for {business}. Before it can go live, one thing needs a change:

{reason}

Once that's updated in your dashboard, we'll approve it right away. If anything is unclear, just reply to this email.

${SIGN}`,
    },
    de: {
      subject: 'Eine kleine Änderung, bevor Ihre Stempelkarte live geht',
      body: `Hallo,

danke, dass Sie Ihre Stempelkarte für {business} eingerichtet haben. Bevor sie live gehen kann, muss noch eine Sache angepasst werden:

{reason}

Sobald das in Ihrem Dashboard geändert ist, geben wir die Karte direkt frei. Wenn etwas unklar ist, antworten Sie einfach auf diese E-Mail.

${SIGN}`,
    },
  },
  {
    id: 'new_feature', icon: '✨', title: 'New: menu & table ordering', when: 'Tell shops about the free digital menu, table ordering and coupons.', kind: 'marketing', fields: [],
    en: {
      subject: 'New in Stampfix: a free digital menu with table ordering',
      body: `Hi there,

Something new for {business}: Stampfix now includes a digital menu with table ordering, and coupons, free on every plan.

Guests scan a QR code on their table, order from their phone and pay at the counter as usual. You can also create coupons that show on your menu. You'll find it all under Add-ons in your dashboard.

Upload photos of your menu there and we'll add the items for you.

${SIGN}`,
    },
    de: {
      subject: 'Neu bei Stampfix: kostenlose digitale Speisekarte mit Bestellung am Tisch',
      body: `Hallo,

etwas Neues für {business}: Stampfix enthält jetzt eine digitale Speisekarte mit Bestellung am Tisch und Gutscheine, in jedem Tarif kostenlos.

Gäste scannen einen QR-Code auf ihrem Tisch, bestellen mit dem Handy und bezahlen wie gewohnt an der Theke. Außerdem können Sie Gutscheine erstellen, die auf Ihrer Speisekarte erscheinen. Sie finden alles unter Add-ons in Ihrem Dashboard.

Laden Sie dort Fotos Ihrer Speisekarte hoch, dann tragen wir die Artikel für Sie ein.

${SIGN}`,
    },
  },
  {
    id: 'feedback', icon: '💬', title: 'Ask for feedback', when: 'They’ve used Stampfix for a while. Ask what works and what doesn’t.', kind: 'marketing', fields: [],
    en: {
      subject: 'How is Stampfix working for {business}?',
      body: `Hi there,

You've been using Stampfix at {business} for a while now, and I'd love to hear how it's going. What's working, and what's annoying? Even one line helps.

Just reply to this email. I read every answer.

${SIGN}`,
    },
    de: {
      subject: 'Wie läuft Stampfix bei {business}?',
      body: `Hallo,

Sie nutzen Stampfix bei {business} jetzt schon eine Weile, und ich würde gern hören, wie es läuft. Was funktioniert gut, was nervt? Schon eine Zeile hilft.

Antworten Sie einfach auf diese E-Mail. Ich lese jede Antwort.

${SIGN}`,
    },
  },
  {
    id: 'winback', icon: '💌', title: 'Win back: free month', when: 'They cancelled Pro. Includes a code for 1 month of Pro.', kind: 'marketing',
    fields: [{ key: 'code', label: 'Code for 1 month free', hint: CODE_HINT }],
    en: {
      subject: 'We’d love to have {business} back',
      body: `Hi there,

I saw that {business} stopped using Stampfix Pro. If something didn't work for you, I'd really like to know; just reply with a line.

If you'd like to give it another go, here's a code for 1 month of Pro for free: {code}. Enter it at checkout under Settings, Account & billing.

${SIGN}`,
    },
    de: {
      subject: 'Wir würden uns freuen, {business} wiederzusehen',
      body: `Hallo,

ich habe gesehen, dass {business} Stampfix Pro nicht mehr nutzt. Falls etwas nicht gepasst hat, würde ich das wirklich gern wissen; antworten Sie einfach mit einer Zeile.

Wenn Sie es noch einmal versuchen möchten, hier ein Code für 1 Monat Pro kostenlos: {code}. Sie lösen ihn beim Bezahlen unter Einstellungen, Konto & Abrechnung ein.

${SIGN}`,
    },
  },
  {
    id: 'support_reply', icon: '🛟', title: 'Answer a question', when: 'Reply to a support question or ticket.', kind: 'service',
    fields: [{ key: 'topic', label: 'What they asked about', hint: 'A few words, e.g. "adding a second location"' }, { key: 'answer', label: 'Your answer', long: true }],
    en: {
      subject: 'About your question: {topic}',
      body: `Hi there,

Thanks for your question about {topic}.

{answer}

If anything is still unclear, just reply to this email.

${SIGN}`,
    },
    de: {
      subject: 'Zu Ihrer Frage: {topic}',
      body: `Hallo,

danke für Ihre Frage zu {topic}.

{answer}

Wenn noch etwas unklar ist, antworten Sie einfach auf diese E-Mail.

${SIGN}`,
    },
  },
  {
    id: 'blank', icon: '📝', title: 'Write your own', when: 'Start from a blank email.', kind: 'service', fields: [],
    en: { subject: '', body: `Hi there,\n\n\n\n${SIGN}` },
    de: { subject: '', body: `Hallo,\n\n\n\n${SIGN}` },
  },
];

/** The fields filled from the shop's account. */
export function autoFields(shop: { business_name: string | null; card_count?: number | null }, lang: EmailLang): Record<string, string> {
  return {
    business: shop.business_name?.trim() || (lang === 'de' ? 'Ihr Geschäft' : 'your shop'),
    customers: String(shop.card_count ?? 0),
  };
}

/** The label for a {field} the admin fills in. */
export function fieldLabel(key: string, tpl: ShopEmailTemplate | null): TemplateField {
  return tpl?.fields.find((f) => f.key === key) ?? { key, label: key.replace(/_/g, ' ') };
}

/** A caution shown above Send when the template doesn't fit the shop. */
export function templateWarning(id: string, shop: { plan: string; card_count: number }): string | null {
  if ((id === 'pro_ended' || id === 'winback' || id === 'free_limit') && shop.plan === 'pro') return 'This shop is on Pro right now.';
  if (id === 'payment_failed' && shop.plan !== 'pro') return 'This shop is on the free plan.';
  if (id === 'free_limit' && shop.card_count < 5) return `This shop has ${shop.card_count} customers, fewer than 5.`;
  if (id === 'setup_incomplete' && shop.card_count > 0) return `This shop already has ${shop.card_count} customers.`;
  return null;
}

/** Fills {field}s that have a value; others stay, so sending is refused until they're done. */
export function fillFields(text: string, values: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (values[k]?.trim() ? values[k].trim() : m));
}

export const langForCountry = (country: string | null | undefined): EmailLang => (country?.toUpperCase() === 'DE' ? 'de' : 'en');

// ---- Data ------------------------------------------------------------------------

export interface ShopInfo {
  to: string | null;
  business_name: string | null;
  opted_out: boolean;
  last: { subject: string; created_at: string; status: 'sending' | 'sent' | 'failed' } | null;
}
export interface SentEmail {
  id: string; merchant_id: string | null; to_email: string; business_name: string | null; template: string | null;
  subject: string; body: string; status: 'sending' | 'sent' | 'failed'; error: string | null; sent_by_email: string | null; created_at: string;
}

export async function getShopInfo(merchantId: string): Promise<ShopInfo> {
  const { data, error } = await supabase.rpc('admin_email_shop_info', { p_merchant: merchantId });
  if (error) throw new Error(error.message);
  return data as ShopInfo;
}
export async function listSentEmails(merchantId: string | null, limit = 100): Promise<SentEmail[]> {
  const { data, error } = await supabase.rpc('admin_sent_emails_list', { p_merchant: merchantId, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as SentEmail[];
}
export async function setShopOptOut(merchantId: string, optedOut: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_email_set_optout', { p_merchant: merchantId, p_opted_out: optedOut });
  if (error) throw new Error(error.message);
}

/** A failed send. `unknownOutcome`: we can't tell whether Resend got it. */
export class SendError extends Error {
  unknownOutcome: boolean;
  constructor(message: string, unknownOutcome: boolean) {
    super(message);
    this.unknownOutcome = unknownOutcome;
  }
}

/**
 * Sends one email. `key` makes Resend drop a repeat: pass the same key only
 * to retry a send whose outcome is unknown, with the same text.
 */
export async function sendShopEmail(p: {
  merchantId: string; template: string; lang: EmailLang; subject: string; body: string; key: string;
}): Promise<{ to: string }> {
  const { data, error } = await supabase.functions.invoke('admin-send-email', {
    body: { merchant_id: p.merchantId, template: p.template, lang: p.lang, subject: p.subject, body: p.body, key: p.key },
  });
  if (error) {
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      let msg = `HTTP ${ctx.status}`;
      try { msg = ((await ctx.json()) as { error?: string }).error ?? msg; } catch { /* keep the status */ }
      throw new SendError(msg, /^network:/.test(msg));
    }
    // No answer from the server: it may or may not have gone out.
    throw new SendError(error.message || 'network', true);
  }
  return data as { to: string };
}

/** Turns a send or load error into words. */
export function shopEmailError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? '');
  if (/Not authorised|Forbidden/i.test(m)) return 'Only full admins can send emails.';
  if (/no_email/.test(m)) return 'This shop has no email address on its account.';
  if (/duplicate_recent/.test(m)) return 'An email with this subject went to this shop in the last 10 minutes (see Sent emails). Wait 10 minutes to send it again.';
  if (/daily_limit/.test(m)) return '200 emails went out in the last 24 hours. Please try again later.';
  if (/^unfilled:/.test(m)) return `Fill in: ${m.slice(9).split(',').join(', ')}`;
  if (/empty_or_too_long/.test(m)) return 'The subject or text is empty or too long.';
  if (/RESEND_API_KEY/.test(m)) return 'The Resend key isn’t set on the server.';
  if (/^Resend 4\d\d/.test(m)) return `Resend refused the email: ${m.replace(/^Resend \d+: /, '').slice(0, 200)}`;
  if (/Could not find the function|does not exist|schema cache/i.test(m)) return 'The Email shops database update isn’t applied yet.';
  if (/HTTP 404/.test(m)) return 'The email function isn’t deployed yet.';
  if (/Failed to send a request|FunctionsFetchError|network/i.test(m)) return 'Couldn’t reach the email server. Check Sent emails before trying again; it may have gone out.';
  return m || 'Something went wrong. Please try again.';
}
