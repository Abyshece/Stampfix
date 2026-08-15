// Supabase Edge Function: generate-blog
// Admin-only. Takes { topic } and returns an SEO-optimised blog post drafted
// by Claude. The admin reviews it in the dashboard before publishing.
//
// Deploy:  supabase functions deploy generate-blog
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Gate to admins: run is_stampfix_admin() as the CALLER.
  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_stampfix_admin');
  if (adminErr || !isAdmin) return json(403, { error: 'Admins only' });

  const { topic } = await req.json().catch(() => ({}));
  if (!topic || typeof topic !== 'string') return json(400, { error: 'Missing "topic"' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(500, { error: 'ANTHROPIC_API_KEY is not set' });

  const prompt = `You are an expert SEO content writer for Stampfix — a digital loyalty-card SaaS for independent merchants (cafés, barbers, bakeries, salons) that replaces paper punch cards with cards in Apple & Google Wallet (no app to download).

Write a blog post about: "${topic}"

Requirements:
- SEO-optimised: a compelling, keyword-rich title (~55-60 characters) and a meta excerpt (~150-155 characters).
- Audience: independent merchant/shop owners. Practical, warm, concrete — no fluff.
- Structure: a short lead paragraph, then 3-5 <h2> sections with short paragraphs. 500-800 words.
- Mention Stampfix naturally where it genuinely helps; do NOT be spammy.
- Do NOT include the title inside the content; start the content with the lead paragraph.

Return ONLY valid JSON (no markdown fences, no commentary) with EXACTLY these keys:
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
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', // change to a newer model string if you like
        max_tokens: 2200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    return json(502, { error: 'Could not reach the AI service', detail: String(e).slice(0, 200) });
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    return json(502, { error: 'AI request failed', detail: t.slice(0, 300) });
  }

  const data = await resp.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
  try {
    const post = JSON.parse(clean);
    return json(200, post);
  } catch {
    return json(502, { error: 'AI returned unparseable output', raw: clean.slice(0, 400) });
  }
});
