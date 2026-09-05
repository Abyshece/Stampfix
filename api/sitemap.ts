// Dynamic sitemap so crawlers/AI can DISCOVER every published post (no rebuild).
export const config = { runtime: 'edge' };
const SITE = 'https://stampfix.app';
async function sb(query: string): Promise<any[] | null> {
  const url = (globalThis as any).process?.env?.VITE_SUPABASE_URL || (globalThis as any).process?.env?.SUPABASE_URL;
  const key = (globalThis as any).process?.env?.VITE_SUPABASE_ANON_KEY || (globalThis as any).process?.env?.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const r = await fetch(`${url}/rest/v1/${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return r.ok ? await r.json() : null;
}
export default async function handler(): Promise<Response> {
  const rows = (await sb('blog_posts?published=eq.true&select=slug,created_at&order=created_at.desc')) || [];
  const pages = ['/', '/pricing', '/features', '/about', '/faq', '/blog'];
  const staticUrls = pages.map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('');
  const postUrls = rows
    .map((p: any) => `<url><loc>${SITE}/blog/${p.slug}</loc>${p.created_at ? `<lastmod>${new Date(p.created_at).toISOString()}</lastmod>` : ''}</url>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${postUrls}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' } });
}
