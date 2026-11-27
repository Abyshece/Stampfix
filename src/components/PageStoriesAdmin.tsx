import { useEffect, useState } from 'react';
import { CircleDot, ExternalLink, Film, Image as ImageIcon, Loader2, Play, RefreshCw, Trash2, Volume2 } from 'lucide-react';
import { adminListPageStories, deletePageStory, type AdminPageStory } from '../lib/businessPage';
import { StoryViewer } from './PageStories';

/**
 * Admin > Stories. Every story shops put on their Business page, newest
 * first. Watch one, open the shop's page, or take it down (full admins).
 * Shops are responsible for their content (Terms); this is for reports.
 */
export function PageStoriesAdmin({ readOnly }: { readOnly: boolean }) {
  const [rows, setRows] = useState<AdminPageStory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AdminPageStory | null>(null);

  const load = async () => {
    setError(null);
    try { setRows(await adminListPageStories()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load stories'); setRows([]); }
  };
  useEffect(() => { void load(); }, []);

  const remove = async (s: AdminPageStory) => {
    if (!window.confirm(`Delete this story from ${s.businessName}? It disappears from their page right away. The shop is not told automatically.`)) return;
    setBusy(s.id);
    const ok = await deletePageStory(s.id);
    setBusy(null);
    if (ok) setRows((r) => (r ?? []).filter((x) => x.id !== s.id));
    else setError('Could not delete the story.');
  };

  return (
    <div className="space-y-6" data-admin-stories>
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif-display font-semibold mb-1">Stories</h1>
          <p className="text-gray-500 text-sm">Stories shops put on their Business page (Pro), newest first. Take one down if it breaks the Terms.</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 text-sm border notion-border bg-white rounded-md px-3 py-1.5 hover:bg-[#F7F7F5]">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed notion-border py-14 text-center text-sm text-gray-400">
          <CircleDot className="w-7 h-7 mx-auto mb-2 text-gray-300" />No stories yet.
        </div>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {rows.map((s) => (
            <li key={s.id} className="rounded-xl border notion-border bg-white overflow-hidden" data-admin-story={s.id}>
              <button type="button" onClick={() => setViewing(s)} className="relative block w-full aspect-[9/14] bg-[#1F1F1F] group">
                <img src={s.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-black/45 flex items-center justify-center text-white"><Play className="w-5 h-5 ml-0.5" /></span></span>
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] px-2 py-0.5">
                  {s.kind === 'video' ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {s.kind === 'video' && s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : 'Photo'}
                  {s.hasSound && <Volume2 className="w-3 h-3" />}
                </span>
                {s.hidden && <span className="absolute right-2 top-2 rounded-full bg-white/90 text-[11px] font-medium px-2 py-0.5">Hidden</span>}
              </button>
              <div className="p-2.5 space-y-1.5">
                <div className="text-sm font-medium truncate" title={s.businessName}>{s.businessName}</div>
                {s.label && <div className="text-xs text-gray-500 truncate">“{s.label}”</div>}
                <div className="text-[11px] text-gray-400">{new Date(s.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                <div className="flex items-center justify-between pt-1">
                  {s.slug
                    ? <a href={`/v/${s.slug}`} target="_blank" rel="noopener noreferrer" className="text-xs inline-flex items-center gap-1 text-gray-600 hover:underline"><ExternalLink className="w-3 h-3" />Page</a>
                    : <span />}
                  {!readOnly && (
                    <button type="button" onClick={() => void remove(s)} disabled={busy !== null} data-admin-story-delete
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 rounded px-1.5 py-1 disabled:opacity-50">
                      {busy === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewing && (
        <StoryViewer stories={[viewing]} start={0} title={viewing.businessName} logo={null} onClose={() => setViewing(null)} onSeen={() => {}} />
      )}
    </div>
  );
}
