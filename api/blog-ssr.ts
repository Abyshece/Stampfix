// Vercel Edge Function: server-render blog HTML for crawlers.
// Reads Supabase directly (public anon key) so posts stay dynamic — no rebuild.
export const config = { runtime: 'edge' };

const SITE = 'https://stampfix.app';
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sb(query: string): Promise<unknown[] | null> {
  const url = (globalThis as any).process?.env?.VITE_SUPABASE_URL || (globalThis as any).process?.env?.SUPABASE_URL;
  const key = (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY || (globalThis as any).process?.env?.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const r = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) return null;
  return (await r.json()) as unknown[];
}

function page(head: string, body: string, noindex = false): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${
      noindex ? '<meta name="robots" content="noindex">' : ''
    }${head}</head><body style="max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.6 -apple-system,system-ui,sans-serif;color:#1a1a1a">${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 's-maxage=600, stale-while-revalidate=86400' } },
  );
}

export default async function handler(req: Request): Promise<Response> {
  const slug = new URL(req.url).searchParams.get('slug');

  if (slug) {
    const rows = await sb(`blog_posts?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=*`);
    const post = rows && rows.length ? (rows[0] as any) : null;
    if (!post) return page(`<title>Not found — Stampfix</title>`, `<h1>Post not found</h1><p><a href="${SITE}/blog">All posts</a></p>`, true);
    const canon = `${SITE}/blog/${post.slug}`;
    const date = post.created_at ? new Date(post.created_at).toISOString() : '';
    const ld = {
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: post.title, description: post.excerpt, datePublished: date, dateModified: date,
      url: canon, mainEntityOfPage: { '@type': 'WebPage', '@id': canon },
      author: { '@type': 'Organization', name: 'Stampfix', url: SITE },
      publisher: { '@type': 'Organization', name: 'Stampfix', url: SITE },
    };
    const head =
      `<title>${esc(post.title)} — Stampfix</title>` +
      `<meta name="description" content="${esc(post.excerpt)}">` +
      `<link rel="canonical" href="${canon}">` +
      `<meta property="og:type" content="article"><meta property="og:title" content="${esc(post.title)}">` +
      `<meta property="og:description" content="${esc(post.excerpt)}"><meta property="og:url" content="${canon}">` +
      `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    const body =
      `<p><a href="${SITE}/blog">← All posts</a></p>` +
      `<article><h1>${esc(post.title)}</h1>` +
      `<p style="color:#777">${esc(post.tag)} · ${esc(post.read_mins || 4)} min read</p>` +
      `${post.content || ''}</article>` +
      `<hr><p><a href="${SITE}">Stampfix — digital loyalty cards in Apple &amp; Google Wallet</a></p>`;
    return page(head, body);
  }

  const rows = (await sb(`blog_posts?published=eq.true&select=*&order=created_at.desc`)) || [];
  const items = rows
    .map((p: any) => `<li style="margin:0 0 24px"><h2 style="margin:0 0 4px"><a href="${SITE}/blog/${esc(p.slug)}">${esc(p.title)}</a></h2><p style="margin:0;color:#555">${esc(p.excerpt)}</p></li>`)
    .join('');
  const head = `<title>Blog — Stampfix</title><meta name="description" content="Guides on loyalty, retention and digital wallet cards for independent merchants."><link rel="canonical" href="${SITE}/blog">`;
  return page(head, `<h1>Stampfix Blog</h1><ul style="list-style:none;padding:0">${items}</ul>`);
}
