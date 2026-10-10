import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Heart, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Media, WorkCard as WorkCardType } from '../lib/types';
import { usePrefersReducedMotion } from '../lib/hooks';
import { useToast } from './ui';

// ───────── Brand ─────────

export function Logo({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'sm' ? 'h-10' : size === 'lg' ? 'h-24 sm:h-28' : 'h-12';
  return (
    <img
      src="/brand/svss-logo-wordmark-sm.webp"
      srcSet="/brand/svss-logo-wordmark-sm.webp 477w, /brand/svss-logo-wordmark.webp 954w"
      sizes="(max-width: 640px) 120px, 180px"
      alt="SVSS Boutique"
      width={477}
      height={300}
      className={clsx(h, 'w-auto rounded-md object-contain shadow-[0_2px_10px_rgba(73,54,58,0.08)] ring-1 ring-gold/25', className)}
    />
  );
}

export const TAGLINE = 'Custom Designing · Maggam · Embroidery · Stitching';

/** Small lotus motif echoing the logo’s crown. */
export function Motif({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 32" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M24 4c3 5 3 11 0 16-3-5-3-11 0-16Z" />
      <path d="M24 20c-4-2-8-7-9-12 5 1 8 6 9 12Zm0 0c4-2 8-7 9-12-5 1-8 6-9 12Z" />
      <path d="M24 20c-6 1-12-1-16-5 6-1 12 1 16 5Zm0 0c6 1 12-1 16-5-6-1-12 1-16 5Z" />
      <circle cx="24" cy="26" r="1.4" fill="currentColor" />
    </svg>
  );
}

// ───────── Motion ─────────

export function Reveal({ children, delay = 0, className, y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ───────── Images ─────────

/** Image with reserved aspect ratio, lazy-loading and an on-brand placeholder when missing. */
export function Img({
  media,
  alt,
  className,
  ratio,
  thumb = false,
  eager = false,
  rounded = 'rounded-lg',
  sizes,
}: {
  media: Media | null | undefined;
  alt: string;
  className?: string;
  ratio?: string; // e.g. "3/4"; defaults to the image's own ratio
  thumb?: boolean;
  eager?: boolean;
  rounded?: string;
  sizes?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const natural = media?.width && media?.height ? `${media.width}/${media.height}` : '3/4';
  const aspect = ratio ?? natural;
  if (!media || failed) {
    return (
      <div className={clsx('relative overflow-hidden bg-gradient-to-br from-blush-50 via-cream to-beige/60', rounded, className)} style={{ aspectRatio: aspect }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gold/80">
          <Motif className="h-10 w-14" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-plum/50">SVSS Boutique</span>
        </div>
      </div>
    );
  }
  const src = thumb && media.thumbUrl ? media.thumbUrl : media.url;
  return (
    <div className={clsx('relative overflow-hidden bg-beige/40', rounded, className)} style={{ aspectRatio: aspect }}>
      {!loaded && <div className="skeleton absolute inset-0" aria-hidden />}
      <img
        src={src}
        srcSet={media.thumbUrl && !thumb ? `${media.thumbUrl} 800w, ${media.url} ${media.width ?? 2000}w` : undefined}
        sizes={sizes ?? '(max-width: 640px) 100vw, 50vw'}
        alt={media.alt || alt}
        width={media.width ?? undefined}
        height={media.height ?? undefined}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={clsx('h-full w-full object-cover transition duration-700', loaded ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  );
}

// ───────── Favourites ─────────

export function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['favorites', 'ids'],
    queryFn: () => api.get<{ ids: string[] }>('/me/favorites/ids'),
    enabled: user?.role === 'CUSTOMER',
    staleTime: 30_000,
  });
}

export function FavoriteButton({ workId, className, withLabel }: { workId: string; className?: string; withLabel?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useFavoriteIds();
  const saved = data?.ids.includes(workId) ?? false;
  const m = useMutation({
    mutationFn: (action: 'add' | 'remove') => (action === 'remove' ? api.delete(`/me/favorites/${workId}`) : api.post(`/me/favorites/${workId}`)),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: ['favorites', 'ids'] });
      const prev = qc.getQueryData<{ ids: string[] }>(['favorites', 'ids']);
      const ids = (prev?.ids ?? []).filter((i) => i !== workId);
      qc.setQueryData(['favorites', 'ids'], { ids: action === 'add' ? [...ids, workId] : ids });
      return { prev };
    },
    onError: (err, _action, ctx) => {
      qc.setQueryData(['favorites', 'ids'], ctx?.prev);
      toast(errorMessage(err), 'error');
    },
    onSuccess: (_d, action) => toast(action === 'add' ? 'Saved to favourites' : 'Removed from favourites'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['favorites'] }),
  });
  if (user?.role === 'ADMIN') return null;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? 'Remove from favourites' : 'Save to favourites'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
          navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
          return;
        }
        m.mutate(saved ? 'remove' : 'add');
      }}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-full bg-cream/85 text-rose-deep backdrop-blur transition hover:bg-ivory',
        withLabel ? 'h-11 px-4 text-[12px] font-semibold uppercase tracking-[0.08em] ring-1 ring-beige' : 'h-10 w-10',
        className,
      )}
    >
      <Heart className={clsx('h-[18px] w-[18px] transition', saved && 'fill-rose text-rose')} />
      {withLabel && (saved ? 'Saved' : 'Save')}
    </button>
  );
}

// ───────── Work card (mock-up “product card”, without any shop features) ─────────

export function WorkCard({ work, index = 0, onQuickView, badge }: { work: WorkCardType; index?: number; arch?: boolean; onQuickView?: (w: WorkCardType) => void; badge?: string }) {
  const tag = badge ?? (work.featured ? 'Featured' : null);
  return (
    <Reveal delay={Math.min(index, 6) * 0.06} className="h-full">
      <article className="group relative flex h-full flex-col overflow-hidden rounded-b-xl rounded-t-[32px] bg-ivory shadow-sm transition-all duration-500 hover:shadow-xl">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-blush-100">
          <Link to={`/recent-work/${work.slug}`} aria-label={work.title} className="block h-full">
            <Img
              media={work.cover}
              alt={work.title}
              thumb
              ratio="3/4"
              rounded="rounded-none"
              className="h-full [&_img]:object-top [&_img]:transition-transform [&_img]:duration-700 group-hover:[&_img]:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </Link>
          {tag && (
            <span className="absolute left-4 top-4 rounded-full bg-gold-dark px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">{tag}</span>
          )}
          <FavoriteButton workId={work.id} className="absolute right-4 top-4 !h-9 !w-9 !bg-ivory/80 shadow-sm" />
          {onQuickView && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onQuickView(work)}
                className="w-full rounded-lg bg-ivory/95 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-rose shadow-md backdrop-blur-md transition-colors hover:bg-rose hover:text-white"
              >
                Quick View
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col justify-between gap-3 p-5">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-plum">{work.category.name}</span>
            <h3 className="mt-0.5 text-[20px] leading-snug text-brown transition-colors group-hover:text-rose">
              <Link to={`/recent-work/${work.slug}`}>{work.title}</Link>
            </h3>
          </div>
          {work.excerpt && <p className="line-clamp-2 text-[13px] text-plum">{work.excerpt}</p>}
          <Link
            to={`/recent-work/${work.slug}#request`}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blush-100 py-2.5 text-[12.5px] font-semibold uppercase tracking-wider text-rose transition-colors hover:bg-rose hover:text-white"
          >
            Request This Design
          </Link>
        </div>
      </article>
    </Reveal>
  );
}

export function QuickView({ work, onClose }: { work: WorkCardType | null; onClose: () => void }) {
  useEffect(() => {
    if (!work) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [work, onClose]);
  return (
    <AnimatePresence>
      {work && (
        <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-brown/40 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={work.title}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-ivory shadow-2xl md:flex-row"
          >
            <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-blush-100 text-rose hover:bg-rose hover:text-white">
              <X className="h-5 w-5" />
            </button>
            <div className="bg-blush-100 md:w-1/2">
              <Img media={work.cover} alt={work.title} ratio="3/4" rounded="rounded-none" className="h-full min-h-[300px] [&_img]:object-top" />
            </div>
            <div className="flex flex-col justify-between gap-4 overflow-y-auto p-6 md:w-1/2 lg:p-8">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gold-dark">{work.category.name}</span>
                <h3 className="mt-1 text-[24px] text-rose">{work.title}</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-plum">{work.excerpt}</p>
              </div>
              <div className="space-y-2.5">
                <Link to={`/recent-work/${work.slug}`} className="flex w-full items-center justify-center rounded bg-rose py-3.5 text-[13px] font-semibold uppercase tracking-wider text-white shadow-md hover:bg-rose-soft">
                  View Full Details
                </Link>
                <Link to={`/recent-work/${work.slug}#request`} className="flex w-full items-center justify-center rounded bg-blush-100 py-3 text-[13px] font-semibold uppercase tracking-wider text-rose hover:bg-blush-200">
                  Request a Similar Design
                </Link>
                <Link to={`/appointments?work=${work.slug}`} className="flex w-full items-center justify-center py-2 text-[12px] font-semibold uppercase tracking-wider text-plum underline underline-offset-4 hover:text-rose">
                  Book an Appointment
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function WorkCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-b-xl rounded-t-[32px] bg-ivory shadow-sm">
      <div className="skeleton aspect-[3/4]" />
      <div className="space-y-2 p-5">
        <div className="skeleton h-5 w-2/3 rounded" />
        <div className="skeleton h-4 w-full rounded" />
      </div>
    </div>
  );
}

// ───────── Lightbox ─────────

export function Lightbox({ items, index, onClose, onIndex }: { items: Media[]; index: number | null; onClose: () => void; onIndex: (i: number) => void }) {
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onIndex((index + 1) % items.length);
      if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, items.length, onClose, onIndex]);
  const item = index !== null ? items[index] : null;
  return (
    <AnimatePresence>
      {item && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#231a1c]/92 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <button className="absolute right-4 top-4 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20" aria-label="Close preview" onClick={onClose}>
            <X className="h-6 w-6" />
          </button>
          {items.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:left-6"
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex((index! - 1 + items.length) % items.length);
                }}
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 sm:right-6"
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation();
                  onIndex((index! + 1) % items.length);
                }}
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}
          <motion.img
            key={item.id}
            src={item.url}
            alt={item.alt ?? ''}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-h-[88vh] max-w-full rounded-md object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 text-[12px] tracking-[0.1em] text-white/70">
            {index! + 1} / {items.length}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
