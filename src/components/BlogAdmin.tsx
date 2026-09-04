import { useEffect, useState } from 'react';
import { Sparkles, Trash2, Eye, Plus, Loader2 } from 'lucide-react';
import {
  listAllBlogPosts, upsertBlogPost, deleteBlogPost,
  type BlogPostRow,
} from '../lib/db';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);

const blank = { id: '', slug: '', title: '', excerpt: '', tag: 'Guide', read_mins: 4, content: '', published: false };

export function BlogAdmin() {
  const [posts, setPosts] = useState<BlogPostRow[]>([]);
  const [form, setForm] = useState<typeof blank>({ ...blank });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => listAllBlogPosts().then(setPosts).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const set = (k: keyof typeof blank, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (publish: boolean) => {
    if (!form.title.trim() || !form.content.trim()) { setErr('Title and content are required.'); return; }
    setSaving(true); setErr(null); setMsg(null);
    try {
      const saved = await upsertBlogPost({
        id: form.id || undefined,
        slug: form.slug.trim() || slugify(form.title),
        title: form.title.trim(), excerpt: form.excerpt.trim(), tag: form.tag.trim() || 'Guide',
        read_mins: Number(form.read_mins) || 4, content: form.content, published: publish,
      });
      setForm({ ...saved });
      setMsg(publish ? 'Published — it is now live on /blog.' : 'Draft saved.');
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  };

  const edit = (p: BlogPostRow) => { setForm({ ...p }); setErr(null); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const remove = async (p: BlogPostRow) => {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try { await deleteBlogPost(p.id); if (form.id === p.id) setForm({ ...blank }); load(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Delete failed'); }
  };

  const inp = 'w-full bg-[#F7F7F5] border notion-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400';

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h2 className="text-xl font-serif-display font-semibold text-[#37352F]">Blog</h2>
        <p className="text-sm text-gray-500">Write and publish SEO-optimised posts to the website.</p>
      </div>

      {/* Editor */}
      <div className="rounded-xl border notion-border bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{form.id ? 'Edit post' : 'New post'}</span>
          <button onClick={() => setForm({ ...blank })} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#37352F]"><Plus className="w-3.5 h-3.5" /> New</button>
        </div>
        <input className={inp} value={form.title} maxLength={120} placeholder="Title" onChange={(e) => set('title', e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inp} value={form.slug} maxLength={80} placeholder="url-slug" onChange={(e) => set('slug', e.target.value)} />
          <input className={inp} value={form.tag} maxLength={24} placeholder="Tag" onChange={(e) => set('tag', e.target.value)} />
        </div>
        <input className={inp} value={form.excerpt} maxLength={170} placeholder="Meta excerpt (~155 chars)" onChange={(e) => set('excerpt', e.target.value)} />
        <textarea className={`${inp} font-mono text-xs`} rows={14} value={form.content} placeholder="HTML body (<p>, <h2>, <ul>…)" onChange={(e) => set('content', e.target.value)} />
        <div className="flex items-center gap-2">
          <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium border notion-border hover:bg-[#F7F7F5] transition disabled:opacity-50">Save draft</button>
          <button onClick={() => save(true)} disabled={saving} className="px-4 py-2 rounded-md text-sm font-medium bg-[#37352F] text-white hover:bg-opacity-90 transition disabled:opacity-50">{saving ? 'Saving…' : 'Publish'}</button>
          {form.slug && <a href={`/blog/${form.slug}`} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#37352F]"><Eye className="w-3.5 h-3.5" /> Preview</a>}
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        {msg && <p className="text-xs text-green-700">{msg}</p>}
      </div>

      {/* Existing posts */}
      <div>
        <h3 className="text-sm font-semibold text-[#37352F] mb-2">All posts ({posts.length})</h3>
        <div className="space-y-2">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border notion-border bg-white px-3 py-2">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${p.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{p.published ? 'Live' : 'Draft'}</span>
              <button onClick={() => edit(p)} className="flex-1 text-left text-sm text-[#37352F] hover:underline truncate">{p.title}</button>
              <span className="text-xs text-gray-400">{p.tag}</span>
              <button onClick={() => remove(p)} className="text-gray-400 hover:text-red-600" aria-label="Delete"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          {posts.length === 0 && <p className="text-sm text-gray-400">No posts yet.</p>}
        </div>
      </div>
    </div>
  );
}
