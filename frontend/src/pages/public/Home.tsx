import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, Award, ChevronLeft, ChevronRight, Mail, MapPin, Phone, Quote } from 'lucide-react';
import { api } from '../../lib/api';
import { useSite } from '../../lib/hooks';
import { decor, decorFor } from '../../lib/decor';
import type { Category, HomeData, Media, WorkCard as WorkCardT } from '../../lib/types';
import { Hero } from '../../components/Hero';
import { QuickView, Reveal, WorkCard, WorkCardSkeleton } from '../../components/visual';
import { Alert, LinkButton, PageLoader } from '../../components/ui';
import { BookingCard } from '../../components/BookingForm';
import { EnquiryForm } from '../../components/EnquiryForm';

export default function HomePage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData>('/public/home') });
  if (isLoading) return <PageLoader />;
  if (error || !data)
    return (
      <div className="container-x pt-44">
        <Alert tone="error">We couldn’t load the page. Please refresh to try again.</Alert>
      </div>
    );
  return <HomeView data={data} />;
}

export function HomeView({ data, preview }: { data: HomeData; preview?: boolean }) {
  const { content: c } = data;
  const s = c.sections;
  return (
    <>
      <Hero content={c.hero} />
      {(s.services || s.collections) && <Curated data={data} />}
      {s.featuredWork && <RecentWorkGrid data={data} preview={preview} />}
      {s.about && <Heritage data={data} />}
      {s.process && c.process.steps.length > 0 && <Process data={data} />}
      {s.booking && !preview && (
        <section id="book" className="bg-cream px-5 py-24 sm:px-6 lg:px-12">
          <Reveal>
            <BookingCard eyebrow={c.booking.eyebrow} title={c.booking.title} subtitle={c.booking.subtitle} />
          </Reveal>
        </section>
      )}
      {s.testimonials && data.testimonials.length > 0 && <Testimonials data={data} />}
      {s.contact && !preview && <ContactSection data={data} />}
    </>
  );
}

function SectionIntro({ eyebrow, title, subtitle, id }: { eyebrow: string; title: string; subtitle?: string | null; id?: string }) {
  return (
    <div>
      <div className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-gold-dark">
        <span className="h-px w-6 bg-gold-dark" aria-hidden />
        <span>{eyebrow}</span>
      </div>
      <h2 id={id} className="text-[30px] font-medium text-rose sm:text-[40px] sm:leading-[48px]">
        {title}
      </h2>
      {subtitle && <p className="mt-2 max-w-xl text-[14px] text-plum">{subtitle}</p>}
    </div>
  );
}

// ───────── 2 · Curated for your moments (collections, or the services until collections exist) ─────────

interface CuratedItem {
  id: string;
  to: string;
  title: string;
  text: string | null;
  image: Media;
  badge: string;
  highlight: boolean;
  aside: string | null;
}

function Curated({ data }: { data: HomeData }) {
  const row = useRef<HTMLDivElement>(null);
  const { content: c } = data;
  const useCollections = c.sections.collections && data.collections.length > 0;
  const items: CuratedItem[] = useCollections
    ? data.collections.map((col, i) => ({
        id: col.id,
        to: `/collections/${col.slug}`,
        title: col.title,
        text: col.description,
        image: col.cover ?? decorFor('', i),
        badge: col.featured ? 'Signature Line' : col.workCount ? `${col.workCount} Designs` : 'Collection',
        highlight: col.featured,
        aside: null,
      }))
    : data.services.map((sv, i) => ({
        id: sv.id,
        to: `/services/${sv.slug}`,
        title: sv.title,
        text: sv.summary ?? sv.description,
        image: sv.cover ?? decorFor(sv.slug, i),
        badge: i === 1 ? 'Signature Craft' : 'Service',
        highlight: i === 1,
        aside: sv.priceRange,
      }));
  if (!items.length) return null;
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * (row.current.clientWidth / 1.5), behavior: 'smooth' });
  const section = useCollections ? c.collections : c.services;
  return (
    <section id="curated" className="scroll-mt-28 bg-cream py-20" aria-labelledby="curated-h">
      <div className="container-x">
        <Reveal className="mb-12 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <SectionIntro id="curated-h" eyebrow="Boutique Curation" title={section.title} subtitle={section.subtitle} />
          {items.length > 3 && (
            <div className="flex items-center gap-2">
              {[
                [-1, ChevronLeft, 'Previous'],
                [1, ChevronRight, 'Next'],
              ].map(([dir, Icon, label]) => {
                const I = Icon as typeof ChevronLeft;
                return (
                  <button
                    key={label as string}
                    type="button"
                    onClick={() => scroll(dir as number)}
                    aria-label={label as string}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-blush-100 text-rose transition-colors hover:bg-rose hover:text-white"
                  >
                    <I className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          )}
        </Reveal>
        <div ref={row} className="scrollbar-thin -mx-5 flex snap-x snap-mandatory gap-6 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
          {items.map((it, i) => (
            <Reveal key={it.id} delay={i * 0.08} className="w-[85%] shrink-0 snap-start sm:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)]">
              <Link to={it.to} className="group relative flex h-full flex-col overflow-hidden rounded-b-xl rounded-t-[36px] bg-blush-50 shadow-sm transition-all duration-500 hover:shadow-xl">
                <div className="relative h-96 w-full overflow-hidden">
                  <img
                    src={it.image.thumbUrl ?? it.image.url}
                    alt={it.image.alt || it.title}
                    loading="lazy"
                    className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-blush-50 via-transparent to-transparent opacity-80" />
                  <span
                    className={clsx(
                      'absolute left-4 top-4 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider backdrop-blur-md',
                      it.highlight ? 'bg-gold-soft/90 text-[#785c2a]' : 'bg-ivory/90 text-rose',
                    )}
                  >
                    {it.badge}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <h3 className="text-[22px] font-semibold leading-7 text-brown transition-colors group-hover:text-rose">{it.title}</h3>
                    {it.text && <p className="mt-1.5 line-clamp-2 text-[12px] leading-[18px] text-plum">{it.text}</p>}
                  </div>
                  <div className="flex items-center justify-between pt-4 text-[13px] font-semibold uppercase tracking-wider text-rose">
                    <span className="inline-flex items-center gap-1.5 transition-transform group-hover:translate-x-1">
                      {useCollections ? 'Explore Collection' : 'Explore Service'} <ArrowRight className="h-4 w-4" />
                    </span>
                    {it.aside && <span className="text-[15px] normal-case tracking-normal text-gold-dark">{it.aside}</span>}
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────── 4 · Recent work grid with category pills ─────────

function RecentWorkGrid({ data, preview }: { data: HomeData; preview?: boolean }) {
  const { content: c } = data;
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'latest' | 'featured'>('latest');
  const [quick, setQuick] = useState<WorkCardT | null>(null);
  const limit = c.featuredWork.limit;
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api.get<{ categories: Category[] }>('/public/categories'), enabled: !preview });
  const work = useQuery({
    queryKey: ['work', 'home', category, sort, limit],
    queryFn: () =>
      api.get<{ items: WorkCardT[]; total: number }>(
        `/public/work?limit=${limit}${category !== 'all' ? `&category=${category}` : ''}${sort === 'featured' ? '&featured=true' : ''}`,
      ),
    enabled: !preview,
  });
  const items = preview ? data.featuredWork : work.data?.items ?? [];
  const total = (cats.data?.categories ?? []).reduce((n, x) => n + (x.workCount ?? 0), 0);
  const visibleCats = (cats.data?.categories ?? []).filter((x) => (x.workCount ?? 0) > 0);
  const pill = (on: boolean) =>
    clsx(
      'whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold uppercase tracking-wider transition-all',
      on ? 'bg-rose text-white' : 'bg-blush-100 text-brown hover:bg-blush-200',
    );
  return (
    <section className="bg-cream px-5 py-20 sm:px-6 lg:px-12" aria-labelledby="work-h">
      <div>
        <Reveal className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-gold-dark">From Our Studio</span>
            <h2 id="work-h" className="mt-1 text-[30px] font-medium text-rose sm:text-[40px] sm:leading-[48px]">
              {c.featuredWork.title}
            </h2>
            {c.featuredWork.subtitle && <p className="mt-2 text-[14px] text-plum">{c.featuredWork.subtitle}</p>}
          </div>
          {!preview && (
            <div className="flex items-center gap-3">
              <label htmlFor="work-sort" className="text-[11px] font-semibold uppercase text-plum">
                Sort by:
              </label>
              <select id="work-sort" value={sort} onChange={(e) => setSort(e.target.value as 'latest' | 'featured')} className="rounded-lg bg-blush-50 px-3 py-2 text-[12px] text-brown focus:outline-none">
                <option value="latest">Latest Work</option>
                <option value="featured">Featured Curations</option>
              </select>
            </div>
          )}
        </Reveal>
        {!preview && visibleCats.length > 0 && (
          <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-4" role="tablist" aria-label="Filter by category">
            <button role="tab" aria-selected={category === 'all'} className={pill(category === 'all')} onClick={() => setCategory('all')}>
              All Designs ({total})
            </button>
            {visibleCats.map((x) => (
              <button key={x.id} role="tab" aria-selected={category === x.slug} className={pill(category === x.slug)} onClick={() => setCategory(x.slug)}>
                {x.name}
              </button>
            ))}
          </div>
        )}
        {!preview && work.isLoading ? (
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <WorkCardSkeleton key={i} />
            ))}
          </div>
        ) : items.length ? (
          <>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((w, i) => (
                <WorkCard key={w.id} work={w} index={i} onQuickView={setQuick} />
              ))}
            </div>
            <div className="mt-12 text-center">
              <LinkButton to="/recent-work" variant="outline" size="lg">
                View All Recent Work
              </LinkButton>
            </div>
          </>
        ) : (
          <div className="rounded-3xl bg-blush-50 px-6 py-16 text-center">
            <p className="font-serif text-[26px] text-rose">New pieces are coming soon</p>
            <p className="mt-2 text-[14px] text-plum">Our latest custom designs will appear here. Book a consultation to start yours.</p>
            <LinkButton to="/appointments" className="mt-6">
              Book an Appointment
            </LinkButton>
          </div>
        )}
      </div>
      <QuickView work={quick} onClose={() => setQuick(null)} />
    </section>
  );
}

// ───────── 5 · Heritage / about ─────────

function Heritage({ data }: { data: HomeData }) {
  const a = data.content.about;
  const image = a.image ?? decor('banarasi-saree', 'Bride in a champagne zari saree');
  return (
    <section id="brand-story" className="bg-blush-200 px-5 py-24 sm:px-6 lg:px-12" aria-labelledby="story-h">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <Reveal className="relative lg:col-span-5">
          <div className="relative overflow-hidden rounded-b-2xl rounded-t-[120px] bg-blush-100 shadow-2xl">
            <img src={image.url} alt={image.alt || a.title} loading="lazy" className="h-[440px] w-full object-cover object-center sm:h-[520px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#3e2c2f]/40 to-transparent" />
          </div>
          {(a.badgeTitle || a.badgeText) && (
            <div className="absolute -bottom-6 -right-6 hidden max-w-xs rounded-2xl bg-ivory p-6 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-soft text-[#785c2a]">
                  <Award className="h-6 w-6" />
                </div>
                <div>
                  {a.badgeTitle && <p className="text-[15px] font-semibold text-rose">{a.badgeTitle}</p>}
                  {a.badgeText && <p className="text-[12px] text-plum">{a.badgeText}</p>}
                </div>
              </div>
            </div>
          )}
        </Reveal>
        <Reveal delay={0.1} className="flex flex-col gap-4 lg:col-span-7">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-gold-dark">
            <span className="h-px w-6 bg-gold-dark" aria-hidden />
            <span>{a.eyebrow ?? 'Our Story'}</span>
          </div>
          <h2 id="story-h" className="text-[30px] font-medium leading-tight text-rose sm:text-[40px]">
            {a.title}
          </h2>
          {a.body.split(/\n{2,}/).map((p, i) => (
            <p key={i} className={clsx('whitespace-pre-line leading-relaxed text-plum', i === 0 ? 'text-[16px]' : 'text-[14px]')}>
              {p}
            </p>
          ))}
          {a.stats.length > 0 && (
            <div className="grid grid-cols-3 gap-4 pt-4">
              {a.stats.map((st) => (
                <div key={st.label} className="rounded-xl bg-ivory/80 p-4 backdrop-blur-sm">
                  <p className="font-serif text-[28px] font-bold text-rose">{st.value}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-plum">{st.label}</p>
                </div>
              ))}
            </div>
          )}
          <div className="pt-2">
            <LinkButton to="/about" variant="outline" className="!bg-ivory/70">
              Discover Our Story
            </LinkButton>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Process({ data }: { data: HomeData }) {
  const p = data.content.process;
  return (
    <section className="bg-cream px-5 py-20 sm:px-6 lg:px-12" aria-labelledby="process-h">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-dark">The Journey</span>
          <h2 id="process-h" className="mt-2 text-[30px] font-medium text-rose sm:text-[40px]">
            {p.title}
          </h2>
          {p.subtitle && <p className="mt-2 text-[14px] text-plum">{p.subtitle}</p>}
        </Reveal>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {p.steps.map((st, i) => (
            <Reveal key={st.title} delay={i * 0.08}>
              <li className="h-full rounded-b-xl rounded-t-[32px] bg-blush-50 p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose font-serif text-[16px] text-white">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-4 text-[22px] font-semibold">{st.title}</h3>
                <p className="mt-2 text-[13.5px] text-plum">{st.body}</p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Testimonials({ data }: { data: HomeData }) {
  return (
    <section className="bg-blush-50 px-5 py-20 sm:px-6 lg:px-12" aria-labelledby="t-h">
      <div className="mx-auto max-w-7xl">
        <Reveal className="mx-auto mb-12 max-w-2xl text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold-dark">Testimonials</span>
          <h2 id="t-h" className="mt-2 text-[30px] font-medium text-rose sm:text-[40px]">
            {data.content.testimonials.title}
          </h2>
        </Reveal>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.testimonials.map((t, i) => (
            <Reveal key={t.id} delay={i * 0.08}>
              <figure className="flex h-full flex-col rounded-2xl bg-ivory p-7 shadow-sm">
                <Quote className="h-7 w-7 text-gold-dark" aria-hidden />
                <blockquote className="mt-4 flex-1 font-serif text-[18px] italic leading-relaxed text-brown">“{t.text}”</blockquote>
                <figcaption className="mt-5 pt-4">
                  <span className="font-semibold text-rose">{t.name}</span>
                  {t.context && <span className="block text-[12.5px] text-plum">{t.context}</span>}
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactSection({ data }: { data: HomeData }) {
  const { data: site } = useSite();
  const b = site?.business;
  const c = data.content.contact;
  return (
    <section className="bg-cream px-5 py-20 sm:px-6 lg:px-12" aria-labelledby="contact-h">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <SectionIntro id="contact-h" eyebrow="Contact" title={c.title} subtitle={c.subtitle} />
          <ul className="mt-8 space-y-4 text-[15px] text-plum">
            {b?.phone && (
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-gold-dark" />
                <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="hover:text-rose">
                  {b.phone}
                </a>
              </li>
            )}
            {b?.email && (
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-gold-dark" />
                <a href={`mailto:${b.email}`} className="break-all hover:text-rose">
                  {b.email}
                </a>
              </li>
            )}
            {b?.address && (
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-gold-dark" />
                <span className="whitespace-pre-line">{b.address}</span>
              </li>
            )}
            {b?.hours && <li className="whitespace-pre-line">{b.hours}</li>}
          </ul>
        </Reveal>
        <Reveal delay={0.1}>
          <EnquiryForm />
        </Reveal>
      </div>
    </section>
  );
}
