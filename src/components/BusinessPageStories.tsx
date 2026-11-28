import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Play, RefreshCw, Trash2, Volume2, Film, Image as ImageIcon, Camera, Tag, Check,
} from 'lucide-react';
import type { Campaign } from '../types';
import {
  addPageStory, deletePageStory, getMyPageStories, reorderPageStories, updatePageStory, STORIES_MAX, STORY_LABEL_MAX,
  type AddStoryError, type MyPageStory,
} from '../lib/businessPage';
import { prepareStoryMedia, StoryMediaError, type StoryMediaErrorCode } from '../lib/storyMedia';
import { ProLockOverlay } from './ProLockOverlay';
import { StoryViewer } from './PageStories';
import { StoryCamera } from './StoryCamera';

// The Stories tab of the Business page (Pro): add up to 10 short videos or
// photos, name, hide, reorder and delete them. Videos are made small in the
// browser before they upload (see lib/storyMedia).

const btnDark = 'inline-flex items-center justify-center gap-1.5 bg-[#37352F] text-white px-3.5 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition disabled:opacity-50';
const btnLight = 'inline-flex items-center justify-center gap-1.5 bg-white border notion-border text-[#37352F] px-3.5 py-2 rounded-md text-sm font-medium hover:bg-[#F7F7F5] transition disabled:opacity-50';
const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center text-gray-500 hover:bg-[#F1F1EF] hover:text-[#37352F] disabled:opacity-30 disabled:hover:bg-transparent';

const MEDIA_ERRORS: Record<StoryMediaErrorCode, [string, string]> = {
  unsupported_browser: ['dash.stories.errBrowser', "This browser can't prepare videos. Use Chrome, Safari or Edge, or add a photo instead."],
  unreadable: ['dash.stories.errUnreadable', "We couldn't open this file. Use a photo (JPG or PNG) or a video (MP4 or MOV)."],
  cannot_decode: ['dash.stories.errDecode', "This browser can't read this video. iPhone videos work in Safari. Or on the iPhone go to Settings > Camera > Formats and pick Most Compatible."],
  too_big: ['dash.stories.errBig', 'This file is still too big after shrinking. Try a shorter video.'],
  failed: ['dash.stories.errFailed', 'Something went wrong preparing this file. Try again, or try another one.'],
};
const ADD_ERRORS: Record<AddStoryError, [string, string]> = {
  pro_only: ['dash.stories.errPro', 'Stories are a Pro feature.'],
  too_many: ['dash.stories.errMany', 'You have 10 stories. Delete one to add another.'],
  upload: ['dash.stories.errUpload', 'The upload failed. Check your connection and try again.'],
  bad_kind: ['dash.stories.errAdd', "Couldn't add the story. Try again."],
  label_too_long: ['dash.stories.errAdd', "Couldn't add the story. Try again."],
  bad_duration: ['dash.stories.errAdd', "Couldn't add the story. Try again."],
  bad_files: ['dash.stories.errAdd', "Couldn't add the story. Try again."],
  network: ['dash.stories.errAdd', "Couldn't add the story. Try again."],
};

interface Props {
  campaign: Campaign;
  stories: MyPageStory[] | null;
  loadError: boolean;
  onReload: () => void;
  onChange: (s: MyPageStory[]) => void;
  isPro: boolean;
  canEdit: boolean;
  onUpgrade: () => void;
}

export function StoriesTab({ campaign, stories, loadError, onReload, onChange, isPro, canEdit, onUpgrade }: Props) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rights, setRights] = useState(false);
  const [job, setJob] = useState<{ stage: 'preparing' | 'uploading'; progress: number; video: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<number | null>(null);
  const [camera, setCamera] = useState(false);
  // The name for the next story (shown to guests under its bubble).
  const [nextName, setNextName] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const list = stories ?? [];
  const full = list.length >= STORIES_MAX;
  const canAdd = canEdit && isPro && !full && !job;

  const onFile = async (file: File) => {
    setError(null);
    const video = /^video\//.test(file.type) || /\.(mp4|mov|m4v|webm|mkv|3gp)$/i.test(file.name);
    setJob({ stage: 'preparing', progress: 0, video });
    let prepared;
    try {
      prepared = await prepareStoryMedia(file, (p) => setJob((j) => (j ? { ...j, progress: p } : j)));
    } catch (e) {
      setJob(null);
      const code: StoryMediaErrorCode = e instanceof StoryMediaError ? e.code : 'failed';
      setError(t(MEDIA_ERRORS[code][0], { defaultValue: MEDIA_ERRORS[code][1] }));
      return;
    }
    setJob({ stage: 'uploading', progress: 1, video });
    const label = nextName.trim().slice(0, STORY_LABEL_MAX) || null;
    const r = await addPageStory(campaign.id, {
      kind: prepared.kind, media: prepared.media, mediaType: prepared.mediaType, poster: prepared.poster,
      label, durationMs: prepared.durationMs, hasSound: prepared.hasSound,
    });
    if (!r.ok) {
      setJob(null);
      setError(t(ADD_ERRORS[r.error][0], { defaultValue: ADD_ERRORS[r.error][1] }));
      return;
    }
    setNextName('');
    try { onChange(await getMyPageStories(campaign.id)); } catch { onReload(); }
    setJob(null);
  };

  const saveLabel = async (s: MyPageStory) => {
    const v = (labels[s.id] ?? s.label ?? '').trim().slice(0, STORY_LABEL_MAX);
    if (v === (s.label ?? '')) return;
    setBusyId(s.id);
    const ok = await updatePageStory(s.id, v || null, s.hidden);
    setBusyId(null);
    if (ok) {
      onChange(list.map((x) => (x.id === s.id ? { ...x, label: v || null } : x)));
      setSavedId(s.id);
      window.setTimeout(() => setSavedId((cur) => (cur === s.id ? null : cur)), 1800);
    } else setError(t('dash.page.errNetwork', { defaultValue: "Couldn't save. Check your connection and try again." }));
  };
  const toggleHidden = async (s: MyPageStory) => {
    setBusyId(s.id);
    const ok = await updatePageStory(s.id, s.label, !s.hidden);
    setBusyId(null);
    if (ok) onChange(list.map((x) => (x.id === s.id ? { ...x, hidden: !s.hidden } : x)));
    else setError(t('dash.page.errNetwork', { defaultValue: "Couldn't save. Check your connection and try again." }));
  };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    const ok = await reorderPageStories(campaign.id, next.map((x) => x.id));
    if (!ok) { onChange(list); setError(t('dash.page.errNetwork', { defaultValue: "Couldn't save. Check your connection and try again." })); }
  };
  const remove = async (s: MyPageStory) => {
    if (!window.confirm(t('dash.stories.confirmDelete', { defaultValue: 'Delete this story? It disappears from your page right away.' }))) return;
    setBusyId(s.id);
    const ok = await deletePageStory(s.id);
    setBusyId(null);
    if (ok) onChange(list.filter((x) => x.id !== s.id));
    else setError(t('dash.stories.errDelete', { defaultValue: "Couldn't delete the story. Try again." }));
  };

  const uploader = (
    <div className="rounded-xl border-2 border-dashed border-[#E2E1DE] bg-[#FBFBFA] p-4 sm:p-5 space-y-4" data-stories-add>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{t('dash.stories.addTitle', { defaultValue: 'Add a story' })}</h3>
          <p className="text-sm text-gray-500 max-w-xl">{t('dash.stories.addHint', { defaultValue: 'A video (we keep the first 10 seconds) or a photo. Upright works best, like on Instagram. We make videos small so they load fast.' })}</p>
        </div>
        <span className="text-xs font-semibold text-gray-500 bg-white border notion-border rounded-full px-2.5 py-1" data-stories-count>{t('dash.stories.count', { n: list.length, max: STORIES_MAX, defaultValue: '{{n}} of {{max}}' })}</span>
      </div>
      <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
        <input type="checkbox" checked={rights} disabled={!canEdit || !isPro} onChange={(e) => setRights(e.target.checked)} data-stories-rights
          className="mt-0.5 w-4 h-4 accent-[#37352F]" />
        <span>{t('dash.stories.rights', { defaultValue: "This is my own photo or video, there's no copyrighted music in it, and everyone you can see in it agreed." })}</span>
      </label>
      <input ref={fileRef} type="file" accept="video/*,image/*" className="hidden" data-stories-file
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onFile(f); }} />
      {job ? (
        <div className="space-y-2" data-stories-job={job.stage}>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="w-4 h-4 animate-spin" />
            {job.stage === 'uploading'
              ? t('dash.stories.uploading', { defaultValue: 'Uploading…' })
              : job.video
                ? t('dash.stories.preparingVideo', { pct: Math.round(job.progress * 100), defaultValue: 'Preparing your video… {{pct}}%' })
                : t('dash.stories.preparingPhoto', { defaultValue: 'Preparing your photo…' })}
          </div>
          <div className="h-1.5 rounded-full bg-[#F1F1EF] overflow-hidden max-w-md">
            <div className="h-full rounded-full bg-[#37352F] transition-all" style={{ width: `${job.stage === 'uploading' ? 100 : Math.max(4, job.progress * 100)}%` }} />
          </div>
          {job.video && job.stage === 'preparing' && <p className="text-xs text-gray-500">{t('dash.stories.keepOpen', { defaultValue: 'Keep this page open. It takes a few seconds.' })}</p>}
        </div>
      ) : (
        <div className="space-y-3">
        <div className="max-w-md">
          <label htmlFor="story-next-name" className="text-sm font-medium inline-flex items-center gap-1.5"><Tag className="w-3.5 h-3.5 text-gray-500" />{t('dash.stories.nameLabel', { defaultValue: 'Story name' })}</label>
          <input id="story-next-name" value={nextName} maxLength={STORY_LABEL_MAX} disabled={!canAdd} onChange={(e) => setNextName(e.target.value)} data-stories-name
            placeholder={t('dash.stories.namePh', { defaultValue: 'e.g. New menu, Our team, Today\'s cakes' })}
            className="mt-1 w-full border notion-border rounded-lg bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#37352F]/10 disabled:bg-[#FBFBFA]" />
          <p className="text-xs text-gray-500 mt-1">{t('dash.stories.nameHint', { n: STORY_LABEL_MAX, defaultValue: 'Shown under the bubble so guests know what it is about. Optional, up to {{n}} characters. Type it, then add the story.' })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={btnDark} disabled={!canAdd || !rights} onClick={() => fileRef.current?.click()} data-stories-pick>
            <ImagePlus className="w-4 h-4" />{t('dash.stories.pick', { defaultValue: 'Choose a video or photo' })}
          </button>
          <button type="button" className={btnLight} disabled={!canAdd || !rights} onClick={() => { setError(null); setCamera(true); }} data-stories-camera>
            <Camera className="w-4 h-4" />{t('dash.stories.useCamera', { defaultValue: 'Use camera' })}
          </button>
          {!rights && canAdd && <span className="text-xs text-gray-500">{t('dash.stories.tickFirst', { defaultValue: 'Tick the box first.' })}</span>}
          {full && <span className="text-xs text-gray-500">{t('dash.stories.errMany', { defaultValue: 'You have 10 stories. Delete one to add another.' })}</span>}
        </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600" data-stories-error>{error}</p>}
      {camera && <StoryCamera onClose={() => setCamera(false)} onUse={(file) => { setCamera(false); void onFile(file); }} />}
    </div>
  );

  return (
    <div className="space-y-5" data-stories-tab>
      {canEdit ? (
        <ProLockOverlay locked={!isPro} title={t('dash.stories.pro', { defaultValue: 'Stories are a Pro feature' })} onUpgrade={onUpgrade}>
          {uploader}
        </ProLockOverlay>
      ) : (
        <div className="rounded-xl border notion-border bg-[#F7F7F5] p-4 text-sm text-gray-600" data-read-only>
          {t('dash.stories.readOnly', { defaultValue: 'Only the owner can add or change stories.' })}
        </div>
      )}

      {!isPro && list.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">{t('dash.stories.keptFree', { count: list.length, defaultValue: 'Your stories are kept, but they only show on your page with Pro.' })}</p>
      )}

      {loadError && !stories ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span className="flex-1">{t('dash.stories.loadError', { defaultValue: "We couldn't load your stories." })}</span>
          <button type="button" className={btnLight} onClick={onReload}><RefreshCw className="w-4 h-4" />{t('dash.page.retry', { defaultValue: 'Try again' })}</button>
        </div>
      ) : !stories ? (
        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" />{t('dash.stories.loading', { defaultValue: 'Loading your stories…' })}</div>
      ) : list.length === 0 ? (
        isPro && <p className="text-sm text-gray-500" data-stories-empty>{t('dash.stories.empty', { defaultValue: 'No stories yet. Your first one shows at the top of your page.' })}</p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-stories-list>
          {list.map((s, i) => (
            <li key={s.id} className={`rounded-xl border notion-border bg-white overflow-hidden ${s.hidden ? 'opacity-60' : ''}`} data-story-item={s.id} data-hidden={s.hidden ? '1' : '0'}>
              <button type="button" onClick={() => setViewing(i)} className="relative block w-full aspect-[9/14] bg-[#1F1F1F] group" aria-label={t('dash.stories.watch', { defaultValue: 'Watch' })}>
                <img src={s.posterUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                <span className="absolute inset-0 flex items-center justify-center opacity-90 group-hover:opacity-100">
                  <span className="w-10 h-10 rounded-full bg-black/45 flex items-center justify-center text-white"><Play className="w-5 h-5 ml-0.5" /></span>
                </span>
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] px-2 py-0.5">
                  {s.kind === 'video' ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {s.kind === 'video' && s.durationMs ? `${Math.round(s.durationMs / 1000)}s` : t('dash.stories.photo', { defaultValue: 'Photo' })}
                  {s.hasSound && <Volume2 className="w-3 h-3" />}
                </span>
                {s.hidden && <span className="absolute right-2 top-2 rounded-full bg-white/90 text-[11px] font-medium px-2 py-0.5">{t('dash.stories.hiddenTag', { defaultValue: 'Hidden' })}</span>}
              </button>
              <div className="p-2.5 space-y-2">
                <label className="block">
                  <span className="flex items-center justify-between text-[11px] font-medium text-gray-500 mb-1">
                    <span className="inline-flex items-center gap-1"><Tag className="w-3 h-3" />{t('dash.stories.nameShown', { defaultValue: 'Name shown to guests' })}</span>
                    {savedId === s.id && <span className="inline-flex items-center gap-0.5 text-green-700" data-story-label-saved><Check className="w-3 h-3" />{t('dash.stories.saved', { defaultValue: 'Saved' })}</span>}
                  </span>
                  <input value={labels[s.id] ?? s.label ?? ''} maxLength={STORY_LABEL_MAX} disabled={!canEdit} data-story-label-input
                    onChange={(e) => setLabels((l) => ({ ...l, [s.id]: e.target.value }))}
                    onBlur={() => void saveLabel(s)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    placeholder={t('dash.stories.labelPh2', { defaultValue: 'e.g. Our team' })}
                    className="w-full border notion-border rounded-md px-2 py-1.5 text-xs disabled:bg-white" />
                </label>
                {canEdit && (
                  <div className="flex items-center justify-between">
                    <div className="flex">
                      <button type="button" className={iconBtn} disabled={i === 0 || busyId !== null} onClick={() => void move(i, -1)} aria-label={t('dash.stories.earlier', { defaultValue: 'Show earlier' })} data-story-up><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" className={iconBtn} disabled={i === list.length - 1 || busyId !== null} onClick={() => void move(i, 1)} aria-label={t('dash.stories.later', { defaultValue: 'Show later' })} data-story-down><ArrowDown className="w-4 h-4" /></button>
                    </div>
                    <div className="flex">
                      <button type="button" className={iconBtn} disabled={busyId !== null} onClick={() => void toggleHidden(s)} data-story-hide
                        aria-label={s.hidden ? t('dash.stories.show', { defaultValue: 'Show on page' }) : t('dash.stories.hide', { defaultValue: 'Hide from page' })}
                        title={s.hidden ? t('dash.stories.show', { defaultValue: 'Show on page' }) : t('dash.stories.hide', { defaultValue: 'Hide from page' })}>
                        {busyId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : s.hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button type="button" className={`${iconBtn} hover:!text-red-600`} disabled={busyId !== null} onClick={() => void remove(s)} data-story-delete
                        aria-label={t('dash.stories.delete', { defaultValue: 'Delete' })} title={t('dash.stories.delete', { defaultValue: 'Delete' })}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewing !== null && list.length > 0 && (
        <StoryViewer stories={list} start={viewing} title={campaign.businessName} logo={campaign.logoImage
          ? <img src={campaign.logoImage} alt="" className="w-full h-full object-contain p-1" /> : campaign.customIcon ? <span>{campaign.customIcon}</span> : null}
          onClose={() => setViewing(null)} onSeen={() => {}} />
      )}
    </div>
  );
}
