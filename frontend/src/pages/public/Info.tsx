import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { Facebook, Instagram, Youtube } from '../../components/SocialIcons';
import { api } from '../../lib/api';
import { useDocumentTitle, useSite } from '../../lib/hooks';
import type { HomeData, WorkDetail } from '../../lib/types';
import { LinkButton, PageHeader, PageLoader } from '../../components/ui';
import { Img, Motif, Reveal } from '../../components/visual';
import { EnquiryForm } from '../../components/EnquiryForm';
import { BookingCard } from '../../components/BookingForm';

export function AboutPage() {
  useDocumentTitle('About');
  const { data, isLoading } = useQuery({ queryKey: ['home'], queryFn: () => api.get<HomeData>('/public/home') });
  if (isLoading || !data) return <PageLoader />;
  const a = data.content.about;
  const p = data.content.process;
  return (
    <>
      <PageHeader eyebrow={a.eyebrow ?? 'About'} title={a.title} />
      <section className="container-x grid items-start gap-12 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <Reveal>
          <Img media={a.image} alt={a.title} ratio="4/5" rounded="rounded-t-[999px] rounded-b-2xl" className="mx-auto max-w-md shadow-[var(--shadow-lift)]" />
        </Reveal>
        <Reveal delay={0.1}>
          <div className="prose-text text-[17px] leading-relaxed text-plum">
            {a.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} className="whitespace-pre-line">
                {para}
              </p>
            ))}
          </div>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            {data.services.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-beige bg-ivory px-4 py-3">
                <Motif className="h-4 w-6 shrink-0 text-gold" />
                <span className="font-serif text-[18px]">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <LinkButton to="/recent-work" variant="dark">
              See our work
            </LinkButton>
            <LinkButton to="/appointments" variant="outline">
              Book an appointment
            </LinkButton>
          </div>
        </Reveal>
      </section>
      {p.steps.length > 0 && (
        <section className="border-t border-beige/70 bg-ivory py-16">
          <div className="container-x">
            <h2 className="mb-10 text-center text-[32px] text-rose-deep">{p.title}</h2>
            <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {p.steps.map((s, i) => (
                <li key={s.title} className="rounded-xl border border-beige bg-cream p-6">
                  <span className="font-serif text-[28px] text-gold">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-2 text-[21px]">{s.title}</h3>
                  <p className="mt-2 text-[14.5px] text-plum/85">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}
    </>
  );
}

export function ContactPage() {
  useDocumentTitle('Contact');
  const { data: site } = useSite();
  const b = site?.business;
  const socials = b
    ? ([
        ['Instagram', b.socials.instagram, Instagram],
        ['Facebook', b.socials.facebook, Facebook],
        ['YouTube', b.socials.youtube, Youtube],
      ] as const).filter(([, u]) => u)
    : [];
  const hasDetails = Boolean(b && (b.phone || b.email || b.address || b.hours || b.whatsapp));
  return (
    <>
      <PageHeader eyebrow="Contact" title="We’d love to hear from you" subtitle="Ask about a design, a fitting, or anything else — we reply as soon as we can." />
      <section className="container-x grid gap-12 py-14 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          {hasDetails && (
            <div className="card space-y-5 p-6">
              {b?.phone && (
                <InfoRow icon={<Phone className="h-5 w-5" />} label="Phone">
                  <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="hover:text-rose-deep">{b.phone}</a>
                </InfoRow>
              )}
              {b?.whatsapp && (
                <InfoRow icon={<MessageCircle className="h-5 w-5" />} label="WhatsApp">
                  <a href={`https://wa.me/${b.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-rose-deep">
                    {b.whatsapp}
                  </a>
                </InfoRow>
              )}
              {b?.email && (
                <InfoRow icon={<Mail className="h-5 w-5" />} label="Email">
                  <a href={`mailto:${b.email}`} className="break-all hover:text-rose-deep">{b.email}</a>
                </InfoRow>
              )}
              {b?.address && (
                <InfoRow icon={<MapPin className="h-5 w-5" />} label="Studio">
                  <span className="whitespace-pre-line">{b.address}</span>
                  {b.mapLink && (
                    <a href={b.mapLink} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[13px] text-rose-deep underline">
                      Open in Maps
                    </a>
                  )}
                </InfoRow>
              )}
              {b?.hours && (
                <InfoRow icon={<Clock className="h-5 w-5" />} label="Hours">
                  <span className="whitespace-pre-line">{b.hours}</span>
                </InfoRow>
              )}
            </div>
          )}
          {socials.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {socials.map(([label, url, Icon]) => (
                <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-ivory px-4 py-2 text-[13px] font-semibold ring-1 ring-beige hover:bg-blush-50">
                  <Icon className="h-4 w-4 text-rose" /> {label}
                </a>
              ))}
            </div>
          )}
          {b?.mapEmbedUrl && (
            <div className="overflow-hidden rounded-xl ring-1 ring-beige">
              <iframe
                title="Map to SVSS Boutique"
                src={b.mapEmbedUrl}
                className="h-72 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin allow-popups"
              />
            </div>
          )}
          {!hasDetails && (
            <div className="rounded-xl border border-dashed border-gold/50 bg-ivory/70 p-6 text-[14.5px] text-plum/85">
              Send us a message using the form and we will get back to you.
            </div>
          )}
        </div>
        <div>
          <h2 className="mb-5 text-[28px] text-rose-deep">Send an enquiry</h2>
          <EnquiryForm />
        </div>
      </section>
    </>
  );
}

function InfoRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush-50 text-rose">{icon}</span>
      <div className="text-[15px]">
        <p className="label-caps mb-0.5 text-plum/70">{label}</p>
        {children}
      </div>
    </div>
  );
}

export function AppointmentsPage() {
  useDocumentTitle('Book an Appointment');
  const [params] = useSearchParams();
  const workSlug = params.get('work');
  const work = useQuery({
    queryKey: ['work-detail', workSlug],
    queryFn: () => api.get<{ work: WorkDetail }>(`/public/work/${workSlug}`),
    enabled: Boolean(workSlug),
    retry: false,
  });
  return (
    <>
      <PageHeader eyebrow="Appointments" title="Book an Appointment" subtitle="Choose a service, then a date and time that suits you. We will confirm your visit." />
      <section className="container-x py-12 sm:py-16">
        {work.data && (
          <div className="mx-auto mb-6 flex max-w-4xl items-center gap-4 rounded-xl bg-blush-50 p-3">
            <Img media={work.data.work.cover} alt={work.data.work.title} thumb ratio="1/1" className="w-16 shrink-0" rounded="rounded-md" />
            <p className="text-[14px] text-plum">
              Booking about <strong className="text-brown">{work.data.work.title}</strong>
            </p>
          </div>
        )}
        <BookingCard
          eyebrow="Private Consultation"
          title="Your Personal Styling Experience"
          subtitle="Choose a service, date and time. We will confirm your visit."
          relatedWork={work.data ? { id: work.data.work.id, title: work.data.work.title } : null}
        />
      </section>
    </>
  );
}

export function NotFoundPage({ what }: { what?: string }) {
  useDocumentTitle('Not found');
  return (
    <section className="flex min-h-[70vh] items-center bg-cream pt-36">
      <div className="container-x text-center">
        <Motif className="mx-auto h-12 w-16 text-gold" />
        <h1 className="mt-4 text-[40px] text-rose-deep sm:text-[52px]">{what ? `This ${what} isn’t available` : 'Page not found'}</h1>
        <p className="mx-auto mt-3 max-w-md text-plum/85">
          {what ? 'It may have been moved or is no longer on display.' : 'The page you are looking for doesn’t exist.'}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton to="/">Go home</LinkButton>
          <LinkButton to="/recent-work" variant="outline">
            Browse recent work
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
