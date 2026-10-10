import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, CalendarHeart, CalendarDays, IndianRupee, Search, Sparkles, X } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useDebounced, useDocumentTitle } from '../../lib/hooks';
import { fmtPlainDate } from '../../lib/format';
import type { Category, Media, WorkCard as WorkCardT, WorkDetail } from '../../lib/types';
import { Alert, Button, EmptyState, LinkButton, PageHeader, PageLoader } from '../../components/ui';
import { FavoriteButton, Img, Lightbox, Motif, Reveal, WorkCard, WorkCardSkeleton } from '../../components/visual';
import { EnquiryForm } from '../../components/EnquiryForm';
import { NotFoundPage } from './Info';

interface WorkPage {
  items: WorkCardT[];
  page: number;
  total: number;
  hasMore: boolean;
}

export function RecentWorkPage() {
  useDocumentTitle('Recent Work');
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? 'all';
  const [q, setQ] = useState(params.get('q') ?? '');
  const debounced = useDebounced(q.trim(), 350);

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (debounced) p.set('q', debounced);
    else p.delete('q');
    setParams(p, { replace: true, preventScrollReset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ categories: Category[] }>('/public/categories') });
  const work = useInfiniteQuery({
    queryKey: ['work', category, debounced],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.get<WorkPage>(`/public/work?page=${pageParam}&limit=18${category !== 'all' ? `&category=${encodeURIComponent(category)}` : ''}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const items = work.data?.pages.flatMap((p) => p.items) ?? [];
  const total = work.data?.pages[0]?.total ?? 0;
  const visibleCats = (cats.data?.categories ?? []).filter((c) => (c.workCount ?? 0) > 0 || c.slug === category);

  const setCategory = (slug: string) => {
    const p = new URLSearchParams(params);
    if (slug === 'all') p.delete('category');
    else p.set('category', slug);
    setParams(p, { preventScrollReset: true });
  };

  return (
    <>
      <PageHeader eyebrow="Portfolio" title="Recent Work" subtitle="Bridal blouses, Maggam work, embroidery and custom outfits recently completed in our studio." />
      <section className="container-x py-10 sm:py-14">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0" role="tablist" aria-label="Filter by category">
            {[{ slug: 'all', name: 'All' }, ...visibleCats].map((c) => (
              <button
                key={c.slug}
                role="tab"
                aria-selected={category === c.slug}
                onClick={() => setCategory(c.slug)}
                className={clsx(
                  'shrink-0 rounded-full border px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] transition',
                  category === c.slug ? 'border-rose bg-rose text-white' : 'border-beige bg-ivory text-plum hover:border-gold',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/50" aria-hidden />
            <label htmlFor="work-search" className="sr-only">
              Search designs
            </label>
            <input
              id="work-search"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search designs…"
              className="w-full rounded-full border border-beige bg-ivory py-2.5 pl-10 pr-10 text-[14px] focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/25"
            />
            {q && (
              <button className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-plum/60 hover:text-brown" onClick={() => setQ('')} aria-label="Clear search">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {work.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <WorkCardSkeleton key={i} />
            ))}
          </div>
        ) : work.error ? (
          <Alert tone="error">The gallery could not be loaded. Please refresh the page.</Alert>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Motif className="h-10 w-14" />}
            title={debounced || category !== 'all' ? 'No designs match' : 'New work is on its way'}
            action={
              debounced || category !== 'all' ? (
                <Button variant="outline" onClick={() => { setQ(''); setCategory('all'); }}>
                  Clear filters
                </Button>
              ) : (
                <LinkButton to="/appointments">Book an appointment</LinkButton>
              )
            }
          >
            {debounced || category !== 'all' ? 'Try another category or search term.' : 'Our latest pieces will appear here soon.'}
          </EmptyState>
        ) : (
          <>
            <p className="mb-5 text-[13px] text-plum/70" aria-live="polite">
              {total} design{total === 1 ? '' : 's'}
            </p>
            <div className="masonry">
              {items.map((w, i) => (
                <WorkCard key={w.id} work={w} index={i % 6} />
              ))}
            </div>
            {work.hasNextPage && (
              <div className="mt-10 text-center">
                <Button variant="outline" onClick={() => work.fetchNextPage()} loading={work.isFetchingNextPage}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function BeforeAfter({ before, after }: { before: Media; after: Media }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: after.width && after.height ? `${after.width}/${after.height}` : '3/4' }}>
      <img src={after.url} alt="After" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before.url} alt="Before" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ivory shadow" style={{ left: `${pos}%` }} />
      <span className="absolute left-3 top-3 rounded-full bg-brown/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">Before</span>
      <span className="absolute right-3 top-3 rounded-full bg-rose/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">After</span>
      <label className="sr-only" htmlFor="ba-range">
        Compare before and after
      </label>
      <input
        id="ba-range"
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-x-0 bottom-4 mx-auto w-[80%] accent-[#B76E82]"
      />
    </div>
  );
}

export function WorkDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['work-detail', slug],
    queryFn: () => api.get<{ work: WorkDetail; related: WorkCardT[] }>(`/public/work/${slug}`),
  });
  useDocumentTitle(data?.work.title);
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="design" />;
  if (!data) return <div className="container-x pt-40"><Alert tone="error">Could not load this design.</Alert></div>;
  return <WorkDetailView work={data.work} related={data.related} />;
}

export function WorkDetailView({ work: w, related, preview }: { work: WorkDetail; related: WorkCardT[]; preview?: boolean }) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const images = [...(w.cover ? [w.cover] : []), ...w.gallery];
  return (
    <>
      <section className={clsx('bg-cream pb-14', preview ? 'pt-8' : 'pt-36 sm:pt-40')}>
        <div className="container-x">
          {!preview && (
            <Link to="/recent-work" className="label-caps mb-8 inline-flex items-center gap-2 text-plum hover:text-rose-deep">
              <ArrowLeft className="h-4 w-4" /> All work
            </Link>
          )}
          <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
            <div>
              {images.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {images.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setLightbox(i)}
                      className={clsx('group block overflow-hidden rounded-xl', i === 0 && 'sm:col-span-2')}
                      aria-label={`Enlarge photo ${i + 1}`}
                    >
                      <Img media={m} alt={`${w.title} — photo ${i + 1}`} eager={i === 0} thumb={i > 0} rounded="rounded-xl" className="[&_img]:transition-transform [&_img]:duration-700 group-hover:[&_img]:scale-[1.03]" sizes={i === 0 ? '(max-width: 1024px) 100vw, 60vw' : '(max-width: 640px) 100vw, 30vw'} />
                    </button>
                  ))}
                </div>
              ) : (
                <Img media={null} alt={w.title} ratio="4/5" />
              )}
              {w.video && (
                <div className="mt-6 overflow-hidden rounded-xl bg-brown">
                  <video src={w.video.url} controls playsInline preload="metadata" className="w-full" aria-label={`${w.title} video`} />
                </div>
              )}
              {w.beforeAfter && (
                <div className="mt-8">
                  <h2 className="mb-4 text-2xl">Before &amp; after</h2>
                  <BeforeAfter before={w.beforeAfter.before} after={w.beforeAfter.after} />
                </div>
              )}
            </div>
            <div className="lg:sticky lg:top-24 lg:self-start">
              <Link to={`/recent-work?category=${w.category.slug}`} className="eyebrow inline-flex items-center gap-3 hover:text-rose-deep">
                <span className="gold-rule" aria-hidden /> {w.category.name}
              </Link>
              <h1 className="mt-3 text-[36px] text-rose-deep sm:text-[46px]">{w.title}</h1>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px] text-plum/85">
                {w.completedAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4 text-gold" /> Completed {fmtPlainDate(w.completedAt)}
                  </span>
                )}
                {w.priceRange && (
                  <span className="inline-flex items-center gap-1.5">
                    <IndianRupee className="h-4 w-4 text-gold" /> {w.priceRange}
                  </span>
                )}
              </div>
              <div className="mt-6 whitespace-pre-line text-[16px] leading-relaxed text-plum">{w.description}</div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {w.enquiryEnabled && (
                  <a href="#request" className="inline-flex min-h-12 items-center justify-center gap-2 rounded bg-rose px-6 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_8px_20px_rgba(183,110,130,0.25)] hover:bg-rose-dark">
                    <Sparkles className="h-4 w-4" /> Request a similar design
                  </a>
                )}
                <LinkButton to={`/appointments?work=${w.slug}`} variant="outline" size="lg">
                  <CalendarHeart className="h-4 w-4" /> Book an appointment
                </LinkButton>
                {!preview && <FavoriteButton workId={w.id} withLabel />}
              </div>
            </div>
          </div>
        </div>
      </section>

      {w.enquiryEnabled && !preview && (
        <section id="request" className="container-x max-w-3xl scroll-mt-24 py-16">
          <h2 className="mb-2 text-[30px] text-rose-deep">Request a similar design</h2>
          <p className="mb-6 text-[15px] text-plum/85">Tell us what you love about this piece and what you would like to change.</p>
          <EnquiryForm relatedWork={{ id: w.id, title: w.title }} />
        </section>
      )}

      {related.length > 0 && (
        <section className="border-t border-beige/70 bg-[#fdf1f3] py-16">
          <div className="container-x">
            <Reveal>
              <h2 className="mb-8 text-[30px] text-rose-deep">You may also like</h2>
            </Reveal>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((r, i) => (
                <WorkCard key={r.id} work={r} index={i} />
              ))}
            </div>
          </div>
        </section>
      )}
      <Lightbox items={images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
    </>
  );
}
