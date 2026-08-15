// Supabase Edge Function: generate-blog
// Admin-only. Uses Google Gemini (Flash) to draft an SEO-optimised blog post.
// Free tier = 1,500 requests/day on Flash models; a 429 means the quota/rate
// limit is hit, which we surface to the UI as { limitReached: true }.
//
// Deploy:  supabase functions deploy generate-blog
// Secret:  supabase secrets set GEMINI_API_KEY=...   (from aistudio.google.com)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

// Gemini Flash model (free 1,500/day). Change here if you want a newer one.
const MODEL = 'gemini-flash-latest';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Gate to admins.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json(401, { error: 'Not authenticated' });
  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (isAdmin !== true) return json(403, { error: 'Admins only' });

  const { topic } = await req.json().catch(() => ({}));
  if (!topic || typeof topic !== 'string') return json(400, { error: 'Missing "topic"' });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) return json(200, { error: 'GEMINI_API_KEY is not set' });

  const prompt = `You are an expert SEO content writer for Stampfix — a digital loyalty-card SaaS for independent merchants (cafés, barbers, bakeries, salons) that replaces paper punch cards with cards in Apple & Google Wallet (no app to download).

Write a blog post about: "${topic}"

SEO + AI-search optimisation requirements:
- A compelling, keyword-rich title (~55-60 characters) that matches real search intent.
- A meta excerpt / description (~150-155 characters) that earns the click.
- Answer the reader's likely question clearly in the FIRST paragraph (helps featured snippets + AI answers).
- Structure with 3-5 descriptive <h2> sections (question- or benefit-led), short scannable paragraphs, and a bullet list where useful.
- 600-900 words, genuinely helpful and specific to independent merchant owners. No fluff, no keyword stuffing.
- Mention Stampfix naturally where it truly helps; never spammy.
- Do NOT include the title inside the content; start the content with the lead paragraph.

Return ONLY valid JSON (no markdown fences) with EXACTLY these keys:
{
  "title": "string",
  "slug": "url-safe-kebab-slug",
  "excerpt": "meta description ~150 chars",
  "tag": "one short category word e.g. Retention",
  "readMins": integer,
  "content": "HTML body only using <p>, <h2>, <ul>, <li>, <strong> — no <html>/<head>/<h1>"
}`;

  let resp: Response;
  try {
    resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2400, responseMimeType: 'application/json' },
      }),
    });
  } catch (e) {
    return json(200, { error: 'Could not reach Gemini: ' + String(e).slice(0, 160) });
  }

  // 429 = quota / rate limit — this is the "free daily limit reached" signal.
  if (resp.status === 429) {
    const detail = await resp.text().catch(() => '');
    return json(200, { limitReached: true, detail: detail.slice(0, 200) });
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    return json(200, { error: `Gemini error ${resp.status}: ${t.slice(0, 200)}` });
  }

  const data = await resp.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    return json(200, JSON.parse(clean));
  } catch {
    return json(200, { error: 'Gemini returned unparseable output', raw: clean.slice(0, 300) });
  }
});
