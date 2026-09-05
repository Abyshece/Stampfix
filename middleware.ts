// Vercel Edge Middleware — "dynamic rendering".
// Humans get the SPA (unchanged). Known crawlers/AI bots hitting /blog or
// /blog/<slug> are rewritten to the /api/blog-ssr edge function, which returns
// fully-rendered HTML (content + meta + JSON-LD) so they can index/cite posts.
import { next, rewrite } from '@vercel/edge';

export const config = { matcher: ['/blog', '/blog/:path*'] };

const BOT =
  /bot|crawler|spider|slurp|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|bytespider|ccbot|amazonbot|applebot|googlebot|bingbot|duckduckbot|yandex|baiduspider|facebookexternalhit|linkedinbot|embedly|slackbot|telegrambot|whatsapp|discordbot/i;

export default function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path !== '/blog' && !path.startsWith('/blog/')) return next();

  const ua = req.headers.get('user-agent') || '';
  if (!BOT.test(ua)) return next(); // real visitors -> SPA

  const slug = path.replace(/^\/blog\/?/, '').replace(/\/+$/, '');
  const dest = new URL('/api/blog-ssr', url.origin);
  if (slug) dest.searchParams.set('slug', slug);
  return rewrite(dest);
}
