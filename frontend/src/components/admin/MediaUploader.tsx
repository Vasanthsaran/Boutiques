import { useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, ArrowRight, Film, Loader2, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { ApiError, uploadWithProgress } from '../../lib/api';
import type { Media } from '../../lib/types';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif';
const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime';
const MAX_IMAGE = 15 * 1024 * 1024;
const MAX_VIDEO = 150 * 1024 * 1024;

interface Pending {
  key: string;
  name: string;
  progress: number;
  preview?: string;
  error?: string;
}

async function uploadOne(file: File, allowVideo: boolean, onProgress: (p: number) => void) {
  const fd = new FormData();
  fd.append('file', file);
  if (allowVideo) fd.append('allowVideo', 'true');
  const res = await uploadWithProgress<{ asset: Media }>('/admin/media', fd, onProgress);
  return res.asset;
}

function precheck(file: File, kind: 'image' | 'video') {
  if (kind === 'image') {
    if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name)) return 'Not an image file.';
    if (file.size > MAX_IMAGE) return 'Larger than 15 MB.';
  } else {
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov)$/i.test(file.name)) return 'Not a video file (MP4, WebM or MOV).';
    if (file.size > MAX_VIDEO) return 'Larger than 150 MB.';
  }
  return null;
}

function useUploads(kind: 'image' | 'video') {
  const [pending, setPending] = useState<Pending[]>([]);
  async function run(files: File[], onDone: (m: Media) => void) {
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const problem = precheck(file, kind);
      const preview = kind === 'image' && !problem ? URL.createObjectURL(file) : undefined;
      setPending((p) => [...p, { key, name: file.name, progress: 0, preview, error: problem ?? undefined }]);
      if (problem) continue;
      try {
        const asset = await uploadOne(file, kind === 'video', (progress) => setPending((p) => p.map((x) => (x.key === key ? { ...x, progress } : x))));
        onDone(asset);
        setPending((p) => p.filter((x) => x.key !== key));
        if (preview) URL.revokeObjectURL(preview);
      } catch (err) {
        setPending((p) => p.map((x) => (x.key === key ? { ...x, error: err instanceof ApiError ? err.message : 'Upload failed.' } : x)));
      }
    }
  }
  const dismiss = (key: string) => setPending((p) => p.filter((x) => x.key !== key));
  return { pending, run, dismiss };
}

function PendingList({ pending, dismiss }: { pending: Pending[]; dismiss: (k: string) => void }) {
  if (!pending.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {pending.map((p) => (
        <li key={p.key} className={clsx('flex items-center gap-3 rounded-md border px-3 py-2 text-[13px]', p.error ? 'border-danger/30 bg-[#fdf0ef]' : 'border-beige bg-ivory')}>
          {p.preview ? <img src={p.preview} alt="" className="h-10 w-10 rounded object-cover" /> : <Film className="h-5 w-5 text-plum/60" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{p.name}</p>
            {p.error ? (
              <p className="text-danger">{p.error}</p>
            ) : (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-beige" role="progressbar" aria-valuenow={p.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${p.name}`}>
                <div className="h-full bg-rose transition-all" style={{ width: `${p.progress}%` }} />
              </div>
            )}
          </div>
          {p.error ? (
            <button type="button" className="text-[12px] underline" onClick={() => dismiss(p.key)}>
              Dismiss
            </button>
          ) : (
            <span className="tabular-nums text-plum/70">{p.progress < 100 ? `${p.progress}%` : <Loader2 className="h-4 w-4 animate-spin" />}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function DropZone({
  onFiles,
  accept,
  multiple,
  label,
  compact,
}: {
  onFiles: (f: File[]) => void;
  accept: string;
  multiple?: boolean;
  label: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
      className={clsx(
        'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition',
        compact ? 'p-4' : 'p-6',
        over ? 'border-rose bg-blush-50' : 'border-beige bg-cream/60 hover:border-gold',
      )}
    >
      <UploadCloud className="h-6 w-6 text-gold" />
      <p className="text-[13.5px] text-plum">
        Drag &amp; drop or{' '}
        <button type="button" className="font-semibold text-rose-deep underline" onClick={() => input.current?.click()}>
          {label}
        </button>
      </p>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Single image slot (cover, hero image…). */
export function SingleImageField({ label, value, onChange, hint, ratio = '4/5' }: { label: string; value: Media | null; onChange: (m: Media | null) => void; hint?: string; ratio?: string }) {
  const { pending, run, dismiss } = useUploads('image');
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">{label}</p>
      {value ? (
        <div className="relative w-full max-w-[220px] overflow-hidden rounded-lg ring-1 ring-beige" style={{ aspectRatio: ratio }}>
          <img src={value.thumbUrl ?? value.url} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
            <button type="button" onClick={() => input.current?.click()} className="inline-flex flex-1 items-center justify-center gap-1 rounded bg-white/90 px-2 py-1.5 text-[11px] font-semibold">
              <RefreshCw className="h-3.5 w-3.5" /> Replace
            </button>
            <button type="button" onClick={() => onChange(null)} className="inline-flex items-center justify-center rounded bg-white/90 px-2 py-1.5" aria-label="Remove image">
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </button>
          </div>
          <input
            ref={input}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              run(Array.from(e.target.files ?? []).slice(0, 1), onChange);
              e.target.value = '';
            }}
          />
        </div>
      ) : (
        <DropZone onFiles={(f) => run(f.slice(0, 1), onChange)} accept={IMAGE_ACCEPT} label="choose an image" compact />
      )}
      {hint && <p className="mt-1.5 text-[12px] text-plum/70">{hint}</p>}
      <PendingList pending={pending} dismiss={dismiss} />
    </div>
  );
}

/** Ordered list of images (gallery). */
export function MultiImageField({ label, value, onChange, hint, max = 30 }: { label: string; value: Media[]; onChange: (m: Media[]) => void; hint?: string; max?: number }) {
  const { pending, run, dismiss } = useUploads('image');
  const latest = useRef(value);
  latest.current = value;
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">
        {label} <span className="font-normal normal-case tracking-normal text-plum/60">({value.length})</span>
      </p>
      {value.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {value.map((m, i) => (
            <li key={m.id} className="group relative aspect-square overflow-hidden rounded-md ring-1 ring-beige">
              <img src={m.thumbUrl ?? m.url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded bg-white/90 p-1 disabled:opacity-30" aria-label="Move earlier">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onChange(value.filter((x) => x.id !== m.id))} className="rounded bg-white/90 p-1" aria-label="Remove image">
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </button>
                <button type="button" disabled={i === value.length - 1} onClick={() => move(i, 1)} className="rounded bg-white/90 p-1 disabled:opacity-30" aria-label="Move later">
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <DropZone
          onFiles={(files) => run(files.slice(0, max - value.length), (m) => onChange([...latest.current, m]))}
          accept={IMAGE_ACCEPT}
          multiple
          label="choose images"
          compact={value.length > 0}
        />
      )}
      {hint && <p className="mt-1.5 text-[12px] text-plum/70">{hint}</p>}
      <PendingList pending={pending} dismiss={dismiss} />
    </div>
  );
}

export function VideoField({ value, onChange }: { value: Media | null; onChange: (m: Media | null) => void }) {
  const { pending, run, dismiss } = useUploads('video');
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em]">Video (optional)</p>
      {value ? (
        <div className="flex items-center gap-3">
          <video src={value.url} className="h-28 rounded-md bg-black" muted controls preload="metadata" />
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-[13px] text-danger underline">
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        </div>
      ) : (
        <DropZone onFiles={(f) => run(f.slice(0, 1), onChange)} accept={VIDEO_ACCEPT} label="choose a video" compact />
      )}
      <p className="mt-1.5 text-[12px] text-plum/70">MP4, WebM or MOV up to 150 MB.</p>
      <PendingList pending={pending} dismiss={dismiss} />
    </div>
  );
}

