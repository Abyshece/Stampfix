// The lines under every email the team sends to a shop from Admin > Email
// shops: who we are, our postal address and how to say no to emails like
// this (Canada's CASL; § 7 UWG for German shops). Shared with the admin
// panel's preview, so what the preview shows is what goes out.

export type EmailLang = 'en' | 'de';

export const SHOP_EMAIL_FOOTER: Record<EmailLang, string> = {
  en: 'Stampfix (17999658 Canada Inc.), 28-16223 23A Ave, Surrey, BC V3Z 6P4, Canada\n'
    + 'You get this email as a Stampfix customer. Don’t want emails like this? Reply "stop".',
  de: 'Stampfix (17999658 Canada Inc.), 28-16223 23A Ave, Surrey, BC V3Z 6P4, Kanada\n'
    + 'Sie erhalten diese E-Mail als Stampfix-Kunde. Keine solchen E-Mails mehr? Antworten Sie mit „Stopp“.',
};

export function withShopFooter(body: string, lang: EmailLang): string {
  return `${body.replace(/\s+$/, '')}\n\n${SHOP_EMAIL_FOOTER[lang]}`;
}

/** Placeholders like {code} still in the text: the email isn't finished. */
export function unfilledFields(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]))];
}
