import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarHeart, Clock, IndianRupee, MessageCircle } from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../lib/hooks';
import type { Collection, Service, WorkCard as WorkCardT } from '../../lib/types';
import { Alert, EmptyState, LinkButton, PageHeader, PageLoader, Pill } from '../../components/ui';
import { Img, Lightbox, Motif, Reveal, WorkCard } from '../../components/visual';
import { EnquiryForm } from '../../components/EnquiryForm';
import { NotFoundPage } from './Info';

export function ServicesPage() {
  useDocumentTitle('Services');
  const { data, isLoading, error } = useQuery({ queryKey: ['services'], queryFn: () => api.get<{ services: Service[] }>('/public/services') });
  return (
    <>
      <PageHeader eyebrow="What we do" title="Services" subtitle="Custom designing, Maggam work, embroidery and stitching — each piece made around you." />
      <section className="container-x py-16 sm:py-20">
        {isLoading && <PageLoader />}
        {error && <Alert tone="error">Services could not be loaded. Please refresh.</Alert>}
        <div className="space-y-16 sm:space-y-24">
          {data?.services.map((s, i) => (
            <Reveal key={s.id}>
              <article className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-16 ${i % 2 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <Img media={s.cover} alt={s.title} ratio="4/5" rounded="rounded-t-[999px] rounded-b-2xl" className="mx-auto w-full max-w-md shadow-[var(--shadow-lift)]" />
                <div>
                  <p className="font-serif text-[15px] italic text-gold-dark">0{i + 1}</p>
                  <h2 className="mt-1 text-[34px] text-rose-deep sm:text-[42px]">{s.title}</h2>
                  {s.summary && <p className="mt-3 text-[17px] text-brown">{s.summary}</p>}
                  <p className="mt-4 whitespace-pre-line text-[15.5px] text-plum/85">{s.description}</p>
                  <ServiceFacts s={s} />
                  <div className="mt-7 flex flex-wrap gap-3">
                    <LinkButton to={`/services/${s.slug}`} variant="dark">
                      Details <ArrowRight className="h-4 w-4" />
                    </LinkButton>
                    {s.isAvailable && (
                      <LinkButton to={`/appointments?service=${s.id}`} variant="outline">
                        Book
                      </LinkButton>
                    )}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>
    </>
  );
}

function ServiceFacts({ s }: { s: Service }) {
  if (!s.priceRange && !s.duration && s.isAvailable && !s.availability) return null;
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {s.priceRange && (
        <Pill>
          <IndianRupee className="mr-1 h-3 w-3" /> {s.priceRange}
        </Pill>
      )}
      {s.duration && (
        <Pill>
          <Clock className="mr-1 h-3 w-3" /> {s.duration}
        </Pill>
      )}
      {!s.isAvailable && <Pill className="!border-danger/30 !text-danger">Currently unavailable</Pill>}
      {s.availability && <Pill>{s.availability}</Pill>}
    </div>
  );
}

export function ServiceDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ['service', slug], queryFn: () => api.get<{ service: Service }>(`/public/services/${slug}`) });
  const [lightbox, setLightbox] = useState<number | null>(null);
  useDocumentTitle(data?.service.title);
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="service" />;
  if (!data) return <div className="container-x pt-40"><Alert tone="error">Could not load this service.</Alert></div>;
  const s = data.service;
  return (
    <>
      <PageHeader eyebrow="Service" title={s.title} subtitle={s.summary ?? undefined}>
        <ServiceFacts s={s} />
      </PageHeader>
      <section className="container-x grid gap-12 py-14 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Img media={s.cover} alt={s.title} eager rounded="rounded-2xl" ratio={s.cover?.width ? undefined : '4/3'} />
          <p className="mt-8 whitespace-pre-line text-[16px] leading-relaxed text-plum">{s.description}</p>
          {s.images.length > 0 && (
            <div className="masonry mt-10">
              {s.images.map((m, i) => (
                <button key={m.id} type="button" onClick={() => setLightbox(i)} className="block w-full overflow-hidden rounded-lg" aria-label={`Open photo ${i + 1}`}>
                  <Img media={m} alt={`${s.title} photo ${i + 1}`} thumb />
                </button>
              ))}
            </div>
          )}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <h2 className="text-2xl">Interested?</h2>
            <p className="mt-2 text-[14.5px] text-plum/85">Book a visit or send us your idea.</p>
            <div className="mt-5 flex flex-col gap-3">
              {s.isAvailable ? (
                <LinkButton to={`/appointments?service=${s.id}`}>
                  <CalendarHeart className="h-4 w-4" /> Book an appointment
                </LinkButton>
              ) : (
                <Alert>This service is not taking bookings right now. You can still send an enquiry.</Alert>
              )}
              <a href="#enquire" className="inline-flex min-h-11 items-center justify-center gap-2 rounded border border-gold/70 text-[12px] font-semibold uppercase tracking-[0.08em] hover:bg-gold/10">
                <MessageCircle className="h-4 w-4" /> Send an enquiry
              </a>
            </div>
          </div>
        </aside>
      </section>
      <section id="enquire" className="container-x max-w-3xl pb-20">
        <h2 className="mb-6 text-[30px] text-rose-deep">Enquire about {s.title}</h2>
        <EnquiryForm defaultServiceId={s.id} />
      </section>
      <Lightbox items={s.images} index={lightbox} onClose={() => setLightbox(null)} onIndex={setLightbox} />
    </>
  );
}

export function CollectionsPage() {
  useDocumentTitle('Collections');
  const { data, isLoading } = useQuery({ queryKey: ['collections'], queryFn: () => api.get<{ collections: Collection[] }>('/public/collections') });
  return (
    <>
      <PageHeader eyebrow="Curated" title="Collections" subtitle="Themed edits of our work — browse by mood, occasion and craft." />
      <section className="container-x py-16">
        {isLoading ? (
          <PageLoader />
        ) : data?.collections.length ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {data.collections.map((c, i) => (
              <Reveal key={c.id} delay={(i % 3) * 0.08}>
                <Link to={`/collections/${c.slug}`} className="group block">
                  <Img media={c.cover} alt={c.title} thumb ratio="3/4" rounded="rounded-t-[999px] rounded-b-2xl" className="shadow-[var(--shadow-soft)] [&_img]:transition-transform [&_img]:duration-[1.2s] group-hover:[&_img]:scale-105" />
                  <div className="mt-5 text-center">
                    <h2 className="text-[26px] group-hover:text-rose-deep">{c.title}</h2>
                    {c.description && <p className="mx-auto mt-1 line-clamp-2 max-w-sm text-[14px] text-plum/80">{c.description}</p>}
                    <p className="label-caps mt-2 text-gold-dark">{c.workCount ?? 0} designs</p>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Motif className="h-10 w-14" />} title="Collections are being curated" action={<LinkButton to="/recent-work">Browse recent work</LinkButton>}>
            In the meantime, explore everything we have made recently.
          </EmptyState>
        )}
      </section>
    </>
  );
}

export function CollectionDetailPage() {
  const { slug } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['collection', slug],
    queryFn: () => api.get<{ collection: Collection; works: WorkCardT[] }>(`/public/collections/${slug}`),
  });
  useDocumentTitle(data?.collection.title);
  if (isLoading) return <PageLoader />;
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage what="collection" />;
  if (!data) return <div className="container-x pt-40"><Alert tone="error">Could not load this collection.</Alert></div>;
  return (
    <>
      <PageHeader eyebrow="Collection" title={data.collection.title} subtitle={data.collection.description ?? undefined} />
      <section className="container-x py-14">
        {data.works.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.works.map((w, i) => (
              <WorkCard key={w.id} work={w} index={i} />
            ))}
          </div>
        ) : (
          <EmptyState title="No designs here yet">Check back soon.</EmptyState>
        )}
      </section>
    </>
  );
}
