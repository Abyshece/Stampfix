// Vercel Edge Middleware — "dynamic rendering".
// Humans get the SPA (unchanged). Known crawlers/AI bots get server-rendered
// HTML with structured data: /blog(/slug) -> blog-ssr, marketing pages -> page-ssr.
import { next, rewrite } from '@vercel/edge';

export const config = { matcher: ['/', '/pricing', '/features', '/about', '/faq', '/use-cases', '/blog', '/blog/:path*'] };

const BOT =
  /bot|crawler|spider|slurp|gptbot|oai-searchbot|chatgpt|claudebot|claude-web|anthropic|perplexity|bytespider|ccbot|amazonbot|applebot|googlebot|bingbot|duckduckbot|yandex|baiduspider|facebookexternalhit|linkedinbot|embedly|slackbot|telegrambot|whatsapp|discordbot/i;

const PAGE_ROUTES = new Set(['/', '/pricing', '/features', '/about', '/faq', '/use-cases']);

// Posts written into the site itself (BlogPage.tsx) aren't in the database, so
// blog-ssr would answer "not found" + noindex for them. Serve bots the SPA.
const BUILT_IN_POSTS = new Set([
  'end-of-paper-punch-card', 'hidden-cost-of-paper-punch-cards',
  'why-nobody-downloads-your-app', 'apple-wallet-vs-native-apps',
]);

export default function middleware(req: Request) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const isBlog = path === '/blog' || path.startsWith('/blog/');
  const isPage = PAGE_ROUTES.has(path);
  if (!isBlog && !isPage) return next();

  const ua = req.headers.get('user-agent') || '';
  if (!BOT.test(ua)) return next(); // real visitors -> SPA

  if (isBlog) {
    const slug = path.replace(/^\/blog\/?/, '');
    if (BUILT_IN_POSTS.has(slug)) return next();
    const dest = new URL('/api/blog-ssr', url.origin);
    if (slug) dest.searchParams.set('slug', slug);
    return rewrite(dest);
  }
  const dest = new URL('/api/page-ssr', url.origin);
  dest.searchParams.set('path', path);
  return rewrite(dest);
}
